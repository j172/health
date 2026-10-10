import "server-only";
import { getPool } from "@/lib/server/db/mysql";
import {
  RAIL_SYSTEMS,
  RAIL_SYSTEM_FALLBACK_COUNTY,
  fetchStationCountyMap,
  type RailSystem,
} from "./railStationCounty";
import {
  fetchSeniorFacility,
  fetchSeniorService,
  fetchSeniorMap,
  fetchSeniorTransfer,
  fetchSeniorFacilityAlert,
  flattenFacilityCategories,
  type SeniorStationFacility,
  type SeniorStationService,
  type SeniorStationMap,
  type SeniorStationTransfer,
  type SeniorStationFacilityAlert,
} from "./tdxSeniorClient";
import type { TransitSystemType } from "./types";

export interface TransitAccessibilitySyncSummary {
  ok: boolean;
  stationsUpserted: number;
  mapsUpserted: number;
  transfersUpserted: number;
  errors: string[];
}

export interface TransitAlertsSyncSummary {
  ok: boolean;
  alertsUpserted: number;
  errors: string[];
}

/** TRA/THSR keep their own TransitSystemType; every other RailSystem code in
 * this spec's scope is a metro/light-rail operator. */
const systemTypeFor = (system: RailSystem): TransitSystemType => {
  if (system === "TRA") return "rail";
  if (system === "THSR") return "hsrail";
  return "metro";
};

const FACILITY_CATEGORY_LABELS: Record<string, string> = {
  Elevators: "無障礙電梯",
  Toilets: "無障礙廁所",
  AEDs: "AED",
  PowerBankRentalStations: "行動電源租借",
};

const categoryLabel = (category: string): string => FACILITY_CATEGORY_LABELS[category] || category;

/** Best-effort date parser for TDX's ISO-ish timestamps — returns null (not
 * throwing) on anything unparseable so one bad row never aborts a batch. */
const toSqlDateTime = (value?: string | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
};

interface StationAccumulator {
  stationId: string;
  stationName: string;
  county: string;
  facilityItems: ReturnType<typeof flattenFacilityCategories>;
  servicePhones: string[];
  serviceLines: string[];
  serviceItems: Array<{ serviceName?: string; serviceUrl?: string; servicePhone?: string }>;
}

/**
 * Syncs one RailSystem's Facility + Service + Map + Transfer data (the four
 * endpoints TDX reports as daily-refresh / UpdateInterval=86400 — see
 * runTransitFacilityAlertsSync below for the separately-scheduled
 * Facility/Alert endpoint). Every TDX call is individually try/caught so a
 * single endpoint or system failing (including the TDX base-path issue
 * documented in tdxSeniorClient.ts) is recorded as one error entry and never
 * aborts the other systems/endpoints — mirrors lib/server/youbike/runSync.ts's
 * try/catch-per-city pattern.
 */
async function syncRailSystem(
  system: RailSystem,
  errors: string[],
): Promise<{
  stations: Map<string, StationAccumulator>;
  maps: SeniorStationMap[];
  transfers: SeniorStationTransfer[];
}> {
  const stations = new Map<string, StationAccumulator>();
  let countyMap = new Map<string, string>();

  try {
    countyMap = await fetchStationCountyMap(system);
  } catch (err) {
    errors.push(`${system} station/county lookup failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const countyFor = (stationId: string): string =>
    countyMap.get(stationId) || RAIL_SYSTEM_FALLBACK_COUNTY[system];

  const getOrCreate = (stationId: string, stationName: string): StationAccumulator => {
    let acc = stations.get(stationId);
    if (!acc) {
      acc = {
        stationId,
        stationName,
        county: countyFor(stationId),
        facilityItems: [],
        servicePhones: [],
        serviceLines: [],
        serviceItems: [],
      };
      stations.set(stationId, acc);
    }
    return acc;
  };

  try {
    const facilities = await fetchSeniorFacility(system);
    for (const f of facilities as SeniorStationFacility[]) {
      if (!f.StationID) continue;
      const acc = getOrCreate(f.StationID, f.StationName || f.StationID);
      acc.facilityItems.push(...flattenFacilityCategories(f));
    }
  } catch (err) {
    errors.push(`${system} Facility fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const services = await fetchSeniorService(system);
    for (const s of services as SeniorStationService[]) {
      if (!s.StationID) continue;
      const acc = getOrCreate(s.StationID, s.StationName || s.StationID);
      if (s.ServicePhone) acc.servicePhones.push(s.ServicePhone);
      if (s.ServiceName) {
        acc.serviceLines.push(`${s.ServiceName}${s.Description ? `：${s.Description}` : ""}`);
      }
      acc.serviceItems.push({
        serviceName: s.ServiceName,
        serviceUrl: s.ServiceURL,
        servicePhone: s.ServicePhone,
      });
    }
  } catch (err) {
    errors.push(`${system} Service fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let maps: SeniorStationMap[] = [];
  try {
    maps = await fetchSeniorMap(system);
  } catch (err) {
    errors.push(`${system} Map fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  let transfers: SeniorStationTransfer[] = [];
  try {
    transfers = await fetchSeniorTransfer(system);
  } catch (err) {
    errors.push(`${system} Transfer fetch failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { stations, maps, transfers };
}

/** Facility + Service + Map + Transfer sync — registered as the daily cron job. */
export async function runTransitAccessibilitySync(): Promise<TransitAccessibilitySyncSummary> {
  const summary: TransitAccessibilitySyncSummary = {
    ok: true,
    stationsUpserted: 0,
    mapsUpserted: 0,
    transfersUpserted: 0,
    errors: [],
  };

  const allStations = new Map<RailSystem, Map<string, StationAccumulator>>();
  const allMaps: Array<{ system: RailSystem; map: SeniorStationMap }> = [];
  const allTransfers: Array<{ system: RailSystem; transfer: SeniorStationTransfer }> = [];

  // Batch 3 RailSystems at a time, mirroring youbike/tdxClient.ts's
  // batchSize=3 throttle against TDX's per-minute rate limit.
  const batchSize = 3;
  for (let i = 0; i < RAIL_SYSTEMS.length; i += batchSize) {
    const batch = RAIL_SYSTEMS.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((system) => syncRailSystem(system, summary.errors)),
    );
    for (let j = 0; j < batch.length; j++) {
      const system = batch[j];
      const result = results[j];
      allStations.set(system, result.stations);
      for (const map of result.maps) allMaps.push({ system, map });
      for (const transfer of result.transfers) allTransfers.push({ system, transfer });
    }
  }

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL pool unavailable");
    return summary;
  }

  // 1. Upsert accessible_transit_facilities — one row per (station_id, system_type).
  try {
    for (const [system, stations] of allStations) {
      const systemType = systemTypeFor(system);
      for (const acc of stations.values()) {
        const tags = Array.from(
          new Set(acc.facilityItems.map(({ category }) => categoryLabel(category))),
        );
        const items = acc.facilityItems.map(({ category, item }) => ({
          category,
          facilityName: item.FacilityName ?? null,
          floorLevel: item.FloorLevel ?? null,
          description: item.Description ?? null,
          exitName: item.ExitName ?? null,
          platformName: item.PlatformName ?? null,
          lat: item.PositionLat ?? null,
          lng: item.PositionLon ?? null,
        }));
        for (const s of acc.serviceItems) {
          if (s.serviceUrl) {
            items.push({
              category: "Service",
              facilityName: s.serviceName ?? null,
              floorLevel: null,
              description: s.serviceUrl,
              exitName: null,
              platformName: null,
              lat: null,
              lng: null,
            });
          }
        }
        const featuresJson = JSON.stringify({ tags, items });
        const bookingRules = acc.serviceLines.length > 0 ? acc.serviceLines.join("\n") : null;
        const servicePhone = acc.servicePhones[0] || null;

        await pool.query(
          `INSERT INTO accessible_transit_facilities
            (county, system_type, station_or_agency, facility_name, service_phone, booking_rules, features_json, source, station_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'tdx_senior', ?)
           ON DUPLICATE KEY UPDATE
             county = VALUES(county),
             station_or_agency = VALUES(station_or_agency),
             facility_name = VALUES(facility_name),
             service_phone = VALUES(service_phone),
             booking_rules = VALUES(booking_rules),
             features_json = VALUES(features_json),
             source = 'tdx_senior',
             updated_at = NOW()`,
          [
            acc.county,
            systemType,
            acc.stationName,
            `${acc.stationName} 無障礙設施`,
            servicePhone,
            bookingRules,
            featuresJson,
            acc.stationId,
          ],
        );
        summary.stationsUpserted += 1;
      }
    }
  } catch (err) {
    summary.errors.push(`facilities upsert failed: ${err instanceof Error ? err.message : String(err)}`);
    summary.ok = false;
  }

  // 2. Replace station maps per RailSystem (daily sync — stale rows from a
  // previous run are cleared first so they don't accumulate forever).
  try {
    for (const system of RAIL_SYSTEMS) {
      const rowsForSystem = allMaps.filter((m) => m.system === system);
      if (rowsForSystem.length === 0) continue;
      await pool.query("DELETE FROM accessible_transit_station_maps WHERE rail_system = ?", [system]);
      for (const { map } of rowsForSystem) {
        if (!map.StationID) continue;
        await pool.query(
          `INSERT INTO accessible_transit_station_maps
            (rail_system, station_id, station_name, floor_level, map_name, map_url, geometry)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            system,
            map.StationID,
            map.StationName || map.StationID,
            map.FloorLevel || null,
            map.MapName || null,
            map.MapURL || null,
            map.Geometry || null,
          ],
        );
        summary.mapsUpserted += 1;
      }
    }
  } catch (err) {
    summary.errors.push(`station maps upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Replace transfers per RailSystem, same rationale as maps above.
  try {
    for (const system of RAIL_SYSTEMS) {
      const rowsForSystem = allTransfers.filter((t) => t.system === system);
      if (rowsForSystem.length === 0) continue;
      await pool.query("DELETE FROM accessible_transit_transfers WHERE rail_system = ?", [system]);
      for (const { transfer } of rowsForSystem) {
        if (!transfer.StationID) continue;
        await pool.query(
          `INSERT INTO accessible_transit_transfers
            (rail_system, station_id, station_name, floor_level, exit_id, exit_name, lat, lng,
             transfer_mode, transfer_route_description, transfer_description, is_onsite_transfer)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            system,
            transfer.StationID,
            transfer.StationName || transfer.StationID,
            transfer.FloorLevel || null,
            transfer.ExitID || null,
            transfer.ExitName || null,
            transfer.PositionLat ?? null,
            transfer.PositionLon ?? null,
            transfer.TransferMode || null,
            transfer.TransferRouteDescription || null,
            transfer.TransferDescription || null,
            transfer.IsOnSiteTransfer ? 1 : 0,
          ],
        );
        summary.transfersUpserted += 1;
      }
    }
  } catch (err) {
    summary.errors.push(`transfers upsert failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (summary.stationsUpserted === 0 && summary.errors.length > 0) {
    summary.ok = false;
  }

  return summary;
}

/**
 * Facility/Alert sync — registered as its own, more frequent (every 30
 * minutes) cron job since TDX reports this endpoint's UpdateInterval as -1
 * (event-triggered) rather than the daily 86400 the other four endpoints use.
 */
export async function runTransitFacilityAlertsSync(): Promise<TransitAlertsSyncSummary> {
  const summary: TransitAlertsSyncSummary = { ok: true, alertsUpserted: 0, errors: [] };

  const allAlerts: Array<{ system: RailSystem; alert: SeniorStationFacilityAlert }> = [];

  const batchSize = 3;
  for (let i = 0; i < RAIL_SYSTEMS.length; i += batchSize) {
    const batch = RAIL_SYSTEMS.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map(async (system) => {
        try {
          return await fetchSeniorFacilityAlert(system);
        } catch (err) {
          summary.errors.push(
            `${system} Facility/Alert fetch failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return [];
        }
      }),
    );
    for (let j = 0; j < batch.length; j++) {
      const system = batch[j];
      for (const alert of results[j]) allAlerts.push({ system, alert });
    }
  }

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL pool unavailable");
    return summary;
  }

  try {
    for (const { system, alert } of allAlerts) {
      if (!alert.AlertID || !alert.StationID) continue;
      await pool.query(
        `INSERT INTO accessible_transit_facility_alerts
          (alert_id, rail_system, station_id, station_name, facility_id, facility_name,
           reason, description, start_time, end_time, publish_time)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           station_name = VALUES(station_name),
           facility_id = VALUES(facility_id),
           facility_name = VALUES(facility_name),
           reason = VALUES(reason),
           description = VALUES(description),
           start_time = VALUES(start_time),
           end_time = VALUES(end_time),
           publish_time = VALUES(publish_time),
           updated_at = NOW()`,
        [
          alert.AlertID,
          system,
          alert.StationID,
          alert.StationName || alert.StationID,
          alert.FacilityID || null,
          alert.FacilityName || null,
          alert.Reason || null,
          alert.Description || null,
          toSqlDateTime(alert.StartTime),
          toSqlDateTime(alert.EndTime),
          toSqlDateTime(alert.PublishTime),
        ],
      );
      summary.alertsUpserted += 1;
    }
  } catch (err) {
    summary.errors.push(`alerts upsert failed: ${err instanceof Error ? err.message : String(err)}`);
    summary.ok = false;
  }

  return summary;
}
