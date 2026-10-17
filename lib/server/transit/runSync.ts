import "server-only";
import type { Pool } from "mysql2/promise";
import { ensureSchema, getPool, withAdvisoryLock } from "@/lib/server/db/mysql";
import { getTdxToken } from "@/lib/server/tdx/auth";
import { createJsonStageLogger } from "@/lib/server/sync/stageLog";
import { RAIL_SYSTEMS, fetchStationCountyMap, type RailSystem } from "./railStationCounty";
import {
  fetchSeniorFacility,
  fetchSeniorService,
  fetchSeniorMap,
  fetchSeniorTransfer,
  fetchSeniorFacilityAlert,
  type SeniorStationFacilityAlert,
} from "./tdxSeniorClient";
import {
  runRailSystemsSync,
  SYNC_STAGE_EVENT,
  type RailSystemSyncResult,
  type RailTdxClient,
} from "./railSyncCore";
import { createMysqlRailSyncStore } from "./railSyncStore";
import { fetchAllTdxBusRoutes } from "./tdxBusClient";
import { partitionSyncableCounties } from "./busLowFloorMath";
import type { AccessibleTransitRoute } from "./types";

export interface TransitAccessibilitySyncSummary {
  ok: boolean;
  stationsUpserted: number;
  mapsUpserted: number;
  transfersUpserted: number;
  errors: string[];
  /** Per-system outcome, in the order the systems were processed (stalest first). */
  systems?: RailSystemSyncResult[];
  /** Set when another run of this job holds the lock; not an error. */
  skipped?: "lock_held";
}

export interface TransitAlertsSyncSummary {
  ok: boolean;
  alertsUpserted: number;
  errors: string[];
}

/** MySQL advisory lock so a manual admin run cannot race the 03:15 cron run (both live in the same web process). */
const ACCESSIBILITY_SYNC_LOCK = "transit_accessibility_sync_lock";

/** Best-effort date parser for TDX's ISO-ish timestamps — returns null (not
 * throwing) on anything unparseable so one bad row never aborts a batch. */
const toSqlDateTime = (value?: string | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace("T", " ");
};

/** The real TDX edge for the per-system sync: every call goes through the shared 5 req/min limiter. */
const railTdxClient: RailTdxClient = {
  fetchStationCountyMap,
  fetchFacility: fetchSeniorFacility,
  fetchService: fetchSeniorService,
  fetchMap: fetchSeniorMap,
  fetchTransfer: fetchSeniorTransfer,
};

/**
 * Facility + Service + Map + Transfer sync — registered as the daily cron job.
 *
 * Strictly sequential, one RailSystem at a time: TDX's basic tier allows 5
 * requests/minute for the whole credential, and every call queues through the
 * shared limiter in lib/server/tdx/rateLimiter.ts (13s spacing + 429 back-off).
 * The original 3-system parallel batches fired 40+ requests at once and got
 * HTTP 429 for everything but TRA/THSR on the first live run. A full run is ~50
 * requests, roughly 11 minutes.
 *
 * That is about as long as the production web process lives between host-side
 * SIGKILLs, so (issue #704) each system is written to the database as soon as it
 * has been fetched, the stalest system goes first next time, and nothing is held
 * in memory across systems. The logic is in railSyncCore.ts, the SQL in
 * railSyncStore.ts.
 */
export async function runTransitAccessibilitySync(): Promise<TransitAccessibilitySyncSummary> {
  const summary: TransitAccessibilitySyncSummary = {
    ok: true,
    stationsUpserted: 0,
    mapsUpserted: 0,
    transfersUpserted: 0,
    errors: [],
  };

  // Fail loudly (once) when there is no TDX token at all, instead of letting
  // ~50 per-endpoint calls each fail and report 0 rows.
  if (!(await getTdxToken())) {
    summary.ok = false;
    summary.errors.push("TDX credentials missing or token request failed — nothing was fetched");
    return summary;
  }

  // Checked before the first request: an 11-minute fetch with nowhere to write is wasted TDX quota.
  let pool: Pool;
  try {
    await ensureSchema();
    pool = getPool();
  } catch (err) {
    summary.ok = false;
    summary.errors.push(`MySQL unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return summary;
  }

  const log = createJsonStageLogger({ event: SYNC_STAGE_EVENT, fields: {}, startedAtMs: Date.now() });
  const store = createMysqlRailSyncStore(pool);

  let results: RailSystemSyncResult[];
  try {
    const lock = await withAdvisoryLock(ACCESSIBILITY_SYNC_LOCK, 1, () =>
      runRailSystemsSync({ systems: RAIL_SYSTEMS, client: railTdxClient, store, log }),
    );
    if (!lock.acquired) {
      summary.skipped = "lock_held";
      return summary;
    }
    results = lock.result;
  } catch (err) {
    summary.ok = false;
    summary.errors.push(`sync aborted: ${err instanceof Error ? err.message : String(err)}`);
    return summary;
  }

  summary.systems = results;
  for (const r of results) {
    summary.stationsUpserted += r.stationsUpserted;
    summary.mapsUpserted += r.mapsWritten;
    summary.transfersUpserted += r.transfersWritten;
    summary.errors.push(...r.errors, ...r.guardNotes);
  }
  // A run where not one system completed cleanly is the "nothing worked" case; a few
  // failing systems among healthy ones are reported in errors[] without failing the run.
  summary.ok = results.some((r) => r.success);

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

  if (!(await getTdxToken())) {
    summary.ok = false;
    summary.errors.push("TDX credentials missing or token request failed — nothing was fetched");
    return summary;
  }

  // Sequential through the shared 5 req/min limiter (see
  // runTransitAccessibilitySync) — 10 requests per run, roughly 2 minutes.
  for (const system of RAIL_SYSTEMS) {
    try {
      for (const alert of await fetchSeniorFacilityAlert(system)) allAlerts.push({ system, alert });
    } catch (err) {
      summary.errors.push(
        `${system} Facility/Alert fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
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

export interface TransitBusSyncSummary {
  ok: boolean;
  countiesSynced: number;
  routesUpserted: number;
  /** Counties whose TDX fetch returned nothing this run — their existing
   * rows (seed or a previous successful sync) were left untouched. */
  skippedCounties: string[];
  errors: string[];
}

/**
 * Replaces one county's accessible_transit_routes rows with freshly-synced
 * TDX Basic Bus data inside a transaction, so a mid-write failure can never
 * leave that county's rows deleted-but-not-reinserted (which would otherwise
 * contradict the "sync failure must not blank the page" requirement at the
 * single-county level).
 */
async function replaceCountyRoutes(
  pool: Pool,
  county: string,
  routes: AccessibleTransitRoute[],
): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM accessible_transit_routes WHERE county = ?", [county]);
    const values = routes.map((r) => [
      r.county,
      r.routeId,
      r.routeName,
      r.operatorName,
      r.lowFloorRatio,
      r.isAllLowFloor ? 1 : 0,
      r.wheelchairSlots,
      r.description || null,
      r.source || "tdx_bus",
      r.sampleTrips ? JSON.stringify(r.sampleTrips) : null,
    ]);
    await conn.query(
      `INSERT INTO accessible_transit_routes
        (county, route_id, route_name, operator_name, low_floor_ratio, is_all_low_floor, wheelchair_slots, description, source, sample_trips_json)
       VALUES ?`,
      [values],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Real-data sync for the accessible-transit map's "低地板公車比率" (issue
 * #467 / docs/2.0/tdx-basic-integration-research.md §T1) — replaces the
 * one-time TRANSIT_ROUTES_SEED values in accessible_transit_routes with a
 * daily sync of TDX's Basic Bus Vehicle + Schedule data, computed per county
 * by lib/server/transit/tdxBusClient.ts + busLowFloorMath.ts.
 *
 * Fallback behavior (acceptance criteria: "同步失敗時退回既有的種子資料，不會
 * 讓頁面空白"): a county is only ever touched (DELETE+INSERT, see
 * replaceCountyRoutes above) when this run actually fetched at least one real
 * route for it. A county with zero fetched routes — whether because TDX itself
 * is down, that city's enum 404s, or getTdxToken() has no credentials at all —
 * is recorded in `skippedCounties` and its existing rows (whatever seed data
 * or a previous day's successful sync already put there) are left completely
 * alone. getTransitAccessibilityOverview()'s ensureTransitSeeded() call
 * guarantees there's always *something* in the table in the first place, so
 * the page is never blank even before this sync has ever run successfully.
 */
export async function runTransitBusSync(): Promise<TransitBusSyncSummary> {
  const summary: TransitBusSyncSummary = {
    ok: true,
    countiesSynced: 0,
    routesUpserted: 0,
    skippedCounties: [],
    errors: [],
  };

  let fetchResult: Awaited<ReturnType<typeof fetchAllTdxBusRoutes>>;
  try {
    fetchResult = await fetchAllTdxBusRoutes();
  } catch (err) {
    // Whole-batch failure (e.g. getTdxToken() itself threw) — existing
    // accessible_transit_routes rows are never touched below this point, so
    // the seed/previous-sync fallback is preserved by construction.
    summary.errors.push(
      `TDX bus sync failed entirely, existing seed/previous data left untouched: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return summary;
  }

  for (const [county, msg] of Object.entries(fetchResult.errors)) {
    summary.errors.push(`${county}: ${msg}`);
  }

  const { syncable, skippedCounties } = partitionSyncableCounties(fetchResult.routesByCounty);
  summary.skippedCounties = skippedCounties;

  const pool = getPool();
  if (!pool) {
    summary.ok = false;
    summary.errors.push("MySQL pool unavailable");
    return summary;
  }

  for (const [county, routes] of syncable) {
    try {
      await replaceCountyRoutes(pool, county, routes);
      summary.countiesSynced += 1;
      summary.routesUpserted += routes.length;
    } catch (err) {
      summary.errors.push(
        `${county} DB write failed, rolled back (existing rows preserved): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      summary.ok = false;
    }
  }

  if (summary.countiesSynced === 0 && summary.errors.length > 0) {
    summary.ok = false;
  }

  return summary;
}
