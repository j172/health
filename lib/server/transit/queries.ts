import "server-only";
import type { RowDataPacket } from "mysql2/promise";
import { withConnection } from "@/lib/server/db/mysql";
import {
  TRANSIT_HOTLINES_SEED,
  TRANSIT_ROUTES_SEED,
  TRANSIT_FACILITIES_SEED,
} from "./data/transitSeed";
import type {
  AccessibleTransitRoute,
  AccessibleTransitFacility,
  AccessibleTransitFacilityAlert,
  AccessibleTransitStationMap,
  AccessibleTransitTransfer,
  TransitAccessibilityOverview,
  TransitSystemType,
} from "./types";

interface DbRouteRow extends RowDataPacket {
  id: number;
  county: string;
  route_id: string;
  route_name: string;
  operator_name: string;
  low_floor_ratio: number | string;
  is_all_low_floor: number;
  wheelchair_slots: number;
  description: string | null;
}

interface DbFacilityRow extends RowDataPacket {
  id: number;
  county: string;
  system_type: string;
  station_or_agency: string;
  facility_name: string;
  service_phone: string | null;
  booking_rules: string | null;
  features_json: any;
  lat: number | string | null;
  lng: number | string | null;
  source: string | null;
  station_id: string | null;
}

// alerts/stationMaps/transfers carry rail_system + station_id but no county
// or system_type column of their own (see docs/specs/
// tdx-senior-rail-accessibility-upgrade.md section 3.2-3.4's literal DDL) —
// the county/systemType filters below recover both by joining each row back
// to the accessible_transit_facilities row the same sync run wrote for that
// station_id. TDX station codes aren't guaranteed globally unique across all
// 10 rail systems, so this join is a pragmatic best-effort, not a strict
// guarantee — acceptable here since it only narrows a results list, it's
// never used to key an upsert.
interface DbAlertRow extends RowDataPacket {
  alert_id: string;
  rail_system: string;
  station_id: string;
  station_name: string;
  facility_id: string | null;
  facility_name: string | null;
  reason: string | null;
  description: string | null;
  start_time: string | null;
  end_time: string | null;
  publish_time: string | null;
  county: string | null;
  system_type: string | null;
}

interface DbMapRow extends RowDataPacket {
  rail_system: string;
  station_id: string;
  station_name: string;
  floor_level: string | null;
  map_name: string | null;
  map_url: string | null;
  county: string | null;
  system_type: string | null;
}

interface DbTransferRow extends RowDataPacket {
  rail_system: string;
  station_id: string;
  station_name: string;
  exit_name: string | null;
  transfer_mode: string | null;
  transfer_description: string | null;
  county: string | null;
  system_type: string | null;
}

export async function ensureTransitSeeded(): Promise<void> {
  await withConnection(async (conn) => {
    const [routeCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM accessible_transit_routes"
    );
    if ((routeCount[0]?.cnt || 0) === 0) {
      for (const r of TRANSIT_ROUTES_SEED) {
        await conn.execute(
          `INSERT INTO accessible_transit_routes
           (county, route_id, route_name, operator_name, low_floor_ratio, is_all_low_floor, wheelchair_slots, description)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.county,
            r.routeId,
            r.routeName,
            r.operatorName,
            r.lowFloorRatio,
            r.isAllLowFloor ? 1 : 0,
            r.wheelchairSlots,
            r.description || null,
          ]
        );
      }
    }

    const [facCount] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(*) as cnt FROM accessible_transit_facilities"
    );
    if ((facCount[0]?.cnt || 0) === 0) {
      for (const f of TRANSIT_FACILITIES_SEED) {
        await conn.execute(
          `INSERT INTO accessible_transit_facilities
           (county, system_type, station_or_agency, facility_name, service_phone, booking_rules, features_json, lat, lng)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            f.county,
            f.systemType,
            f.stationOrAgency,
            f.facilityName,
            f.servicePhone || null,
            f.bookingRules || null,
            JSON.stringify(f.features),
            f.lat || null,
            f.lng || null,
          ]
        );
      }
    }
  });
}

/** Reads features_json in either shape: the new `{tags, items}` object TDX-synced
 * rows write, or the plain string[] that seed rows (and any not-yet-migrated
 * row) still carry. Always returns a tags string[] plus the richer items[]
 * when available, so the existing UI's tag rendering never sees anything but
 * a flat string array. */
function parseFeaturesJson(raw: any): { tags: string[]; items: any[] } {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { tags: [], items: [] };
    }
  }
  if (Array.isArray(parsed)) {
    return { tags: parsed, items: [] };
  }
  if (parsed && typeof parsed === "object") {
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  }
  return { tags: [], items: [] };
}

export async function getTransitAccessibilityOverview(filter?: {
  county?: string;
  systemType?: string;
  query?: string;
}): Promise<TransitAccessibilityOverview> {
  await ensureTransitSeeded();

  return await withConnection(async (conn) => {
    let routeSql = "SELECT * FROM accessible_transit_routes WHERE 1=1";
    const routeParams: any[] = [];

    if (filter?.county && filter.county !== "all") {
      routeSql += " AND county = ?";
      routeParams.push(filter.county);
    }
    if (filter?.query && filter.query.trim()) {
      routeSql += " AND (route_name LIKE ? OR operator_name LIKE ? OR description LIKE ?)";
      const q = `%${filter.query.trim()}%`;
      routeParams.push(q, q, q);
    }
    routeSql += " ORDER BY low_floor_ratio DESC, route_name ASC";

    const [routeRows] = await conn.query<DbRouteRow[]>(routeSql, routeParams);

    const routes: AccessibleTransitRoute[] = routeRows.map((r) => ({
      id: r.id,
      county: r.county,
      routeId: r.route_id,
      routeName: r.route_name,
      operatorName: r.operator_name,
      lowFloorRatio: Number(r.low_floor_ratio) || 0,
      isAllLowFloor: Boolean(r.is_all_low_floor),
      wheelchairSlots: r.wheelchair_slots,
      description: r.description,
    }));

    let facSql = "SELECT * FROM accessible_transit_facilities WHERE 1=1";
    const facParams: any[] = [];

    if (filter?.county && filter.county !== "all") {
      facSql += " AND (county = ? OR county = '全國')";
      facParams.push(filter.county);
    }
    if (filter?.systemType && filter.systemType !== "all") {
      facSql += " AND system_type = ?";
      facParams.push(filter.systemType);
    }
    if (filter?.query && filter.query.trim()) {
      facSql += " AND (facility_name LIKE ? OR station_or_agency LIKE ? OR booking_rules LIKE ?)";
      const q = `%${filter.query.trim()}%`;
      facParams.push(q, q, q);
    }

    const [facRows] = await conn.query<DbFacilityRow[]>(facSql, facParams);

    const facilities: AccessibleTransitFacility[] = facRows.map((f) => {
      const { tags, items } = parseFeaturesJson(f.features_json);

      return {
        id: f.id,
        county: f.county,
        systemType: f.system_type as TransitSystemType,
        stationOrAgency: f.station_or_agency,
        facilityName: f.facility_name,
        servicePhone: f.service_phone,
        bookingRules: f.booking_rules,
        features: tags,
        featureItems: items.length > 0 ? items : undefined,
        lat: f.lat ? Number(f.lat) : null,
        lng: f.lng ? Number(f.lng) : null,
        source: (f.source as "seed" | "tdx_senior") || "seed",
        stationId: f.station_id,
      };
    });

    let hotlines = TRANSIT_HOTLINES_SEED;
    if (filter?.county && filter.county !== "all") {
      hotlines = hotlines.filter((h) => h.county === filter.county);
    }

    // alerts/stationMaps/transfers: see the DbAlertRow comment above for why
    // this joins back to accessible_transit_facilities for county/systemType.
    const joinedWhere = (table: string) => {
      let sql = `SELECT t.*, f.county AS county, f.system_type AS system_type
        FROM ${table} t
        LEFT JOIN accessible_transit_facilities f ON f.station_id = t.station_id
        WHERE 1=1`;
      const params: any[] = [];
      if (filter?.county && filter.county !== "all") {
        sql += " AND (f.county = ? OR f.county IS NULL)";
        params.push(filter.county);
      }
      if (filter?.systemType && filter.systemType !== "all") {
        sql += " AND (f.system_type = ? OR f.system_type IS NULL)";
        params.push(filter.systemType);
      }
      return { sql, params };
    };

    const alertsQ = joinedWhere("accessible_transit_facility_alerts");
    if (filter?.query && filter.query.trim()) {
      alertsQ.sql += " AND (t.station_name LIKE ? OR t.facility_name LIKE ? OR t.reason LIKE ?)";
      const q = `%${filter.query.trim()}%`;
      alertsQ.params.push(q, q, q);
    }
    alertsQ.sql += " ORDER BY t.start_time DESC";
    const [alertRows] = await conn.query<DbAlertRow[]>(alertsQ.sql, alertsQ.params);

    const alerts: AccessibleTransitFacilityAlert[] = alertRows.map((a) => ({
      alertId: a.alert_id,
      railSystem: a.rail_system,
      stationName: a.station_name,
      facilityName: a.facility_name,
      reason: a.reason,
      description: a.description,
      startTime: a.start_time,
      endTime: a.end_time,
    }));

    const [activeAlertRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) as cnt FROM accessible_transit_facility_alerts
       WHERE (start_time IS NULL OR start_time <= NOW())
         AND (end_time IS NULL OR end_time >= NOW())`
    );
    const activeAlertCount = Number(activeAlertRows[0]?.cnt || 0);

    const mapsQ = joinedWhere("accessible_transit_station_maps");
    if (filter?.query && filter.query.trim()) {
      mapsQ.sql += " AND (t.station_name LIKE ? OR t.map_name LIKE ?)";
      const q = `%${filter.query.trim()}%`;
      mapsQ.params.push(q, q);
    }
    const [mapRows] = await conn.query<DbMapRow[]>(mapsQ.sql, mapsQ.params);
    const stationMaps: AccessibleTransitStationMap[] = mapRows
      .filter((m) => !!m.map_url)
      .map((m) => ({
        stationName: m.station_name,
        railSystem: m.rail_system,
        floorLevel: m.floor_level,
        mapName: m.map_name,
        mapUrl: m.map_url,
      }));

    const transfersQ = joinedWhere("accessible_transit_transfers");
    if (filter?.query && filter.query.trim()) {
      transfersQ.sql += " AND (t.station_name LIKE ? OR t.transfer_description LIKE ?)";
      const q = `%${filter.query.trim()}%`;
      transfersQ.params.push(q, q);
    }
    const [transferRows] = await conn.query<DbTransferRow[]>(transfersQ.sql, transfersQ.params);
    const transfers: AccessibleTransitTransfer[] = transferRows.map((t) => ({
      stationName: t.station_name,
      railSystem: t.rail_system,
      exitName: t.exit_name,
      transferMode: t.transfer_mode,
      transferDescription: t.transfer_description,
    }));

    const totalRoutes = routes.length;
    const avgLowFloorRatio =
      totalRoutes > 0
        ? Math.round(routes.reduce((sum, r) => sum + r.lowFloorRatio, 0) / totalRoutes)
        : 0;
    const allLowFloorCount = routes.filter((r) => r.isAllLowFloor).length;

    const counties = Array.from(new Set(TRANSIT_HOTLINES_SEED.map((h) => h.county)));
    const systemTypes: TransitSystemType[] = [
      "bus",
      "metro",
      "rail",
      "hsrail",
      "rehab_bus",
      "accessible_taxi",
    ];

    return {
      routes,
      facilities,
      hotlines,
      alerts,
      stationMaps,
      transfers,
      summary: {
        totalRoutes,
        avgLowFloorRatio,
        allLowFloorCount,
        rehabAgenciesCount: hotlines.length,
        activeAlertCount,
      },
      counties,
      systemTypes,
    };
  });
}
