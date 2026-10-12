// Pure, side-effect-free transforms for turning TDX Basic Bus data
// (Vehicle/City + Schedule/City — issue #467 / docs/2.0/tdx-basic-integration-
// research.md §T1) into this repo's AccessibleTransitRoute shape. Deliberately
// has no "server-only" import and does no network/DB I/O so it can be
// dynamically imported and unit-tested directly under plain `node --test`
// (mirrors lib/server/tdx/seniors.ts, the one other TDX-adjacent file in this
// area that's executed rather than only statically scanned in tests).
import type { AccessibleTransitRoute, AccessibleTransitRouteTrip } from "./types";

export interface BusVehicleLowFloorInput {
  plateNumb: string;
  isLowFloor: boolean;
}

export interface BusScheduleTripInput {
  tripId?: string | null;
  isLowFloor: boolean;
  departureTime?: string | null;
}

/**
 * Low-floor ratio (0-100, one decimal place) across a route's current fleet.
 * Dedupes by plate number first — TDX's Vehicle/City snapshot can report the
 * same physical bus more than once (e.g. GPS pings from more than one
 * provider), and double-counting would skew the ratio.
 */
export function computeLowFloorRatio(vehicles: BusVehicleLowFloorInput[]): number {
  const byPlate = new Map<string, boolean>();
  for (const v of vehicles) {
    if (!v.plateNumb) continue;
    byPlate.set(v.plateNumb, v.isLowFloor);
  }
  if (byPlate.size === 0) return 0;
  const lowFloorCount = [...byPlate.values()].filter(Boolean).length;
  return Math.round((lowFloorCount / byPlate.size) * 1000) / 10;
}

/**
 * Builds a small sample of trip-level low-floor flags for the UI's
 * "某條路線某個班次是否為低地板車" requirement — this intentionally keeps only
 * `limit` entries per route rather than every TDX Schedule Timetable (which
 * can run into the hundreds per route per day), since the UI only needs
 * representative examples, not a full timetable.
 */
export function buildSampleTrips(
  trips: BusScheduleTripInput[],
  limit = 5,
): AccessibleTransitRouteTrip[] {
  const out: AccessibleTransitRouteTrip[] = [];
  const seenTripIds = new Set<string>();
  let fallbackIndex = 0;
  for (const t of trips) {
    const tripId = t.tripId || `trip-${fallbackIndex}`;
    fallbackIndex += 1;
    if (seenTripIds.has(tripId)) continue;
    seenTripIds.add(tripId);
    out.push({
      tripId,
      departureTime: t.departureTime ?? null,
      isLowFloor: !!t.isLowFloor,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export interface BuildRoutesFromTdxBusDataParams {
  county: string;
  /** RouteUID (or RouteID when no UID is present) -> that route's current vehicles. */
  vehiclesByRoute: Map<string, BusVehicleLowFloorInput[]>;
  /** RouteUID -> a human-readable route name (RouteName.Zh_tw, or a fallback). */
  routeNamesByRoute: Map<string, string>;
  /** RouteUID -> that route's schedule timetable entries. */
  tripsByRoute: Map<string, BusScheduleTripInput[]>;
  tripSampleLimit?: number;
}

/**
 * Maps grouped TDX Vehicle + Schedule data into AccessibleTransitRoute rows —
 * the one place `IsLowFloor` actually becomes this repo's `lowFloorRatio` /
 * `sampleTrips` shape. Only emits a route when it has at least one vehicle
 * (schedule-only routes, with no live vehicle seen, can't have a ratio
 * computed and are skipped here rather than reported with a misleading 0%).
 */
export function buildRoutesFromTdxBusData(
  params: BuildRoutesFromTdxBusDataParams,
): AccessibleTransitRoute[] {
  const routes: AccessibleTransitRoute[] = [];

  for (const [routeUid, vehicles] of params.vehiclesByRoute) {
    if (vehicles.length === 0) continue;

    const lowFloorRatio = computeLowFloorRatio(vehicles);
    const distinctPlateCount = new Set(vehicles.map((v) => v.plateNumb).filter(Boolean)).size;
    const lowFloorVehicleCount = Math.round((lowFloorRatio / 100) * distinctPlateCount);

    const sampleTrips = buildSampleTrips(
      params.tripsByRoute.get(routeUid) || [],
      params.tripSampleLimit ?? 5,
    );

    routes.push({
      county: params.county,
      routeId: routeUid,
      routeName: params.routeNamesByRoute.get(routeUid) || routeUid,
      operatorName: "交通部 TDX 公車資料",
      lowFloorRatio,
      isAllLowFloor: lowFloorRatio === 100,
      wheelchairSlots: 2,
      description: `依交通部 TDX 即時車輛資料計算：${distinctPlateCount} 輛車中 ${lowFloorVehicleCount} 輛為低地板車。`,
      source: "tdx_bus",
      sampleTrips: sampleTrips.length > 0 ? sampleTrips : undefined,
    });
  }

  return routes;
}

/**
 * Decides, per county, whether a sync run has anything to write. A county
 * with zero fetched routes (TDX outage, bad city enum, empty response, etc.)
 * is "skipped" rather than written — this is the mechanism behind the
 * fallback requirement: runTransitBusSync() must never touch (let alone
 * blank out) a county's existing rows (seed or a previous successful sync)
 * just because today's TDX call failed for that one county.
 */
export function partitionSyncableCounties<T>(
  routesByCounty: Map<string, T[]>,
): { syncable: Map<string, T[]>; skippedCounties: string[] } {
  const syncable = new Map<string, T[]>();
  const skippedCounties: string[] = [];
  for (const [county, routes] of routesByCounty) {
    if (routes.length > 0) {
      syncable.set(county, routes);
    } else {
      skippedCounties.push(county);
    }
  }
  return { syncable, skippedCounties };
}
