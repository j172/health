import { parseAndNormalizeMetroAlert, type NormalizedMetroAlert } from "./metroAlertParser.ts";
import { resolveStationMetadata, type ResolvedStationInfo } from "./stationResolver.ts";

export const RECONCILIATION_CACHE_KEY = "tdx:metro-alerts:reconciliation";
export const RECONCILIATION_TTL_MS = 60 * 60 * 1000; // 1 hour TTL guard
export const DEFAULT_REQUEST_INTERVAL_MS = 1500; // 1.5s interval respecting 5 req/min
export const TDX_METRO_ALERT_BASE = "https://tdx.transportdata.tw/api/basic/v2/Rail/Metro/Alert";

/** 6 Metro and Light Rail operators for scheduled daily reconciliation */
export const METRO_RECONCILIATION_SYSTEMS = [
  "TRTC",
  "NTMC",
  "TYMC",
  "TMRT",
  "KRTC",
  "KLRT",
] as const;

export type MetroReconciliationSystem = (typeof METRO_RECONCILIATION_SYSTEMS)[number];

export interface ReconciliationMeta {
  reconciledAt: string;
  systemsChecked: string[];
  activeCount: number;
  resolvedCount: number;
  status: "ok" | "degraded";
  error?: string;
}

export interface ReconcileResult {
  ok: boolean;
  bypassed?: boolean;
  reconciledAt: string;
  systemsChecked: string[];
  activeCount: number;
  resolvedCount: number;
  errors: string[];
}

export interface ColdStartResult {
  ok: boolean;
  bypassed: boolean;
  reason: string;
  activeCount?: number;
  resolvedCount?: number;
  error?: string;
}

export interface ReconciliationDeps {
  fetchSnapshotFn?: (system: string) => Promise<NormalizedMetroAlert[]>;
  rawFetchFn?: (url: string, token: string) => Promise<{ status: number; data: unknown }>;
  getTokenFn?: () => Promise<string | null>;
  queryFn?: (sql: string, params?: unknown[]) => Promise<any>;
  executeFn?: (sql: string, params?: unknown[]) => Promise<any>;
  resolveStationFn?: (system: string, id: string, name?: string) => Promise<ResolvedStationInfo>;
  sleepFn?: (ms: number) => Promise<void>;
  intervalMs?: number;
  now?: () => Date;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches upstream active disruption alerts for a single metro system via TDX REST API.
 */
export async function fetchRailAlertSnapshot(
  system: string,
  deps: ReconciliationDeps = {},
): Promise<NormalizedMetroAlert[]> {
  if (deps.fetchSnapshotFn) {
    return deps.fetchSnapshotFn(system);
  }

  const getToken =
    deps.getTokenFn ??
    (async () => {
      const { getTdxToken } = await import("../auth");
      return getTdxToken();
    });

  const token = await getToken();
  if (!token) {
    throw new Error("TDX credentials missing or token request failed");
  }

  const url = `${TDX_METRO_ALERT_BASE}/${system}?%24format=JSON`;

  let status: number;
  let data: unknown;

  if (deps.rawFetchFn) {
    const res = await deps.rawFetchFn(url, token);
    status = res.status;
    data = res.data;
  } else {
    const { tdxGetJsonWithRetry } = await import("../getJsonWithRetry");
    const res = await tdxGetJsonWithRetry<unknown>(url, token, { timeoutMs: 12000 });
    status = res.status;
    data = res.data;
  }

  if (status === 404) {
    return [];
  }

  if (status !== 200 || !Array.isArray(data)) {
    throw new Error(`TDX Metro/Alert/${system} returned status ${status}`);
  }

  const normalized = parseAndNormalizeMetroAlert(data, system);

  // In-memory dimension enrichment
  for (const alert of normalized) {
    if (alert.stationId && alert.stationId !== "ALL") {
      const enriched = await resolveStationMetadata(
        alert.railSystem,
        alert.stationId,
        alert.stationName,
        { lookupFn: deps.resolveStationFn },
      );
      if (enriched.stationName) {
        alert.stationName = enriched.stationName;
      }
    }
  }

  return normalized;
}

/**
 * Executes full reconciliation against the 6 Metro operators:
 * 1. Fetches upstream active disruption alerts sequentially (1.5s interval).
 * 2. Upserts active alerts into accessible_transit_facility_alerts ("先入 DB 再讀 DB").
 * 3. Soft-resolves disappeared alerts with `end_time = NOW()`.
 *    Guarantees strict boundary isolation: filters by `facility_name LIKE '%· 營運通報'`
 *    and `(facility_id IS NULL OR facility_id NOT LIKE '%-EL%')` to protect elevator alerts.
 * 4. Caches audit metadata into `provider_api_cache` key `tdx:metro-alerts:reconciliation`.
 */
export async function reconcileRailAlerts(
  deps: ReconciliationDeps = {},
): Promise<ReconcileResult> {
  const now = deps.now ? deps.now() : new Date();
  const nowIso = now.toISOString();
  const sleepImpl = deps.sleepFn ?? sleep;
  const intervalMs = deps.intervalMs !== undefined ? deps.intervalMs : DEFAULT_REQUEST_INTERVAL_MS;

  const errors: string[] = [];
  let totalActive = 0;
  let totalResolved = 0;
  const systemsChecked: string[] = [];

  // Helper for DB query
  const runQuery = async (sql: string, params: unknown[] = []): Promise<any[]> => {
    if (deps.queryFn) {
      return deps.queryFn(sql, params);
    }
    const { getPool } = await import("../../db/mysql");
    const pool = getPool();
    if (!pool) throw new Error("Database pool unavailable");
    const [rows] = await pool.query(sql, params);
    return rows as any[];
  };

  // Helper for DB execute/update
  const runExecute = async (sql: string, params: any[] = []): Promise<any> => {
    if (deps.executeFn) {
      return deps.executeFn(sql, params);
    }
    const { getPool } = await import("../../db/mysql");
    const pool = getPool();
    if (!pool) throw new Error("Database pool unavailable");
    const [result] = await pool.execute(sql, params as any);
    return result;
  };

  for (let i = 0; i < METRO_RECONCILIATION_SYSTEMS.length; i++) {
    const system = METRO_RECONCILIATION_SYSTEMS[i];
    systemsChecked.push(system);

    try {
      // 1. Fetch active disruptions from upstream
      const activeAlerts = await fetchRailAlertSnapshot(system, deps);
      totalActive += activeAlerts.length;

      // 2. Upsert active alerts into DB
      for (const a of activeAlerts) {
        const facilityName = a.lineName ? `${a.lineName} · 營運通報` : `${a.systemLabel} · 營運通報`;

        await runExecute(
          `INSERT INTO accessible_transit_facility_alerts
            (alert_id, rail_system, station_id, station_name, facility_id, facility_name,
             reason, description, start_time, end_time, publish_time)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             station_name = VALUES(station_name),
             facility_name = VALUES(facility_name),
             reason = VALUES(reason),
             description = VALUES(description),
             start_time = VALUES(start_time),
             end_time = VALUES(end_time),
             publish_time = VALUES(publish_time),
             updated_at = NOW()`,
          [
            a.alertId,
            a.railSystem,
            a.stationId,
            a.stationName,
            a.lineId || null,
            facilityName,
            a.reason,
            a.description,
            a.startTime,
            a.endTime,
            a.publishTime,
          ],
        );
      }

      // 3. Soft-resolve drift: alerts present in DB for this system but absent upstream
      // BOUNDARY ISOLATION: strictly filter on disruption facility_name and exclude elevator facility_ids.
      const activeUpstreamIds = new Set(activeAlerts.map((a) => a.alertId));

      const dbActiveRows = await runQuery(
        `SELECT alert_id FROM accessible_transit_facility_alerts
         WHERE rail_system = ?
           AND facility_name LIKE '%· 營運通報'
           AND (facility_id IS NULL OR facility_id NOT LIKE '%-EL%')
           AND (end_time IS NULL OR end_time >= NOW())`,
        [system],
      );

      for (const row of dbActiveRows) {
        const dbAlertId = String(row.alert_id);
        if (!activeUpstreamIds.has(dbAlertId)) {
          // Soft-resolve: set end_time = NOW() to instantly eliminate drift from active views
          await runExecute(
            `UPDATE accessible_transit_facility_alerts
             SET end_time = NOW(), updated_at = NOW()
             WHERE alert_id = ?
               AND facility_name LIKE '%· 營運通報'
               AND (facility_id IS NULL OR facility_id NOT LIKE '%-EL%')`,
            [dbAlertId],
          );
          totalResolved += 1;
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${system}: ${msg}`);
      console.warn(`[TDX-Reconcile] Error reconciling system ${system}:`, msg);
    }

    // Rate-limit throttle between operators (except after the last one)
    if (i < METRO_RECONCILIATION_SYSTEMS.length - 1 && intervalMs > 0) {
      await sleepImpl(intervalMs);
    }
  }

  // 4. Persist audit metadata into provider_api_cache
  const meta: ReconciliationMeta = {
    reconciledAt: nowIso,
    systemsChecked,
    activeCount: totalActive,
    resolvedCount: totalResolved,
    status: errors.length > 0 ? "degraded" : "ok",
    ...(errors.length > 0 ? { error: errors.join("; ") } : {}),
  };

  try {
    const utcNowStr = nowIso.slice(0, 19).replace("T", " ");
    await runExecute(
      `INSERT INTO provider_api_cache (cache_key, response_json, fetched_at_utc)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         response_json = VALUES(response_json),
         fetched_at_utc = VALUES(fetched_at_utc)`,
      [RECONCILIATION_CACHE_KEY, JSON.stringify(meta), utcNowStr],
    );
  } catch (cacheErr) {
    console.warn("[TDX-Reconcile] Failed to write reconciliation cache:", cacheErr);
  }

  return {
    ok: errors.length === 0,
    reconciledAt: nowIso,
    systemsChecked,
    activeCount: totalActive,
    resolvedCount: totalResolved,
    errors,
  };
}

/**
 * Cold-Start Snapshot sequence with 1-hour TTL Guard and graceful degradation:
 * 1. Checks provider_api_cache for key `tdx:metro-alerts:reconciliation`.
 * 2. If verified < 1 hour ago AND active disruption records exist in DB, bypass REST calls.
 * 3. Otherwise, executes reconcileRailAlerts to seed the baseline and soft-resolve drift.
 * 4. Never blocks server boot on failure.
 */
export async function ensureColdStartSnapshot(
  deps: ReconciliationDeps = {},
): Promise<ColdStartResult> {
  const now = deps.now ? deps.now() : new Date();

  // Helper for DB query
  const runQuery = async (sql: string, params: unknown[] = []): Promise<any[]> => {
    if (deps.queryFn) {
      return deps.queryFn(sql, params);
    }
    const { getPool } = await import("../../db/mysql");
    const pool = getPool();
    if (!pool) return [];
    const [rows] = await pool.query(sql, params);
    return rows as any[];
  };

  try {
    // Check provider_api_cache
    const cacheRows = await runQuery(
      `SELECT response_json, fetched_at_utc
       FROM provider_api_cache
       WHERE cache_key = ?
       LIMIT 1`,
      [RECONCILIATION_CACHE_KEY],
    );

    if (cacheRows && cacheRows.length > 0) {
      const cached = cacheRows[0];
      let fetchedAt = NaN;

      if (cached.response_json) {
        try {
          const parsed = JSON.parse(cached.response_json);
          if (parsed.reconciledAt) {
            fetchedAt = new Date(parsed.reconciledAt).getTime();
          }
        } catch {
          // fallback to fetched_at_utc
        }
      }

      if (Number.isNaN(fetchedAt) && cached.fetched_at_utc) {
        const utcStr = String(cached.fetched_at_utc).includes("Z")
          ? cached.fetched_at_utc
          : `${String(cached.fetched_at_utc).replace(" ", "T")}Z`;
        fetchedAt = new Date(utcStr).getTime();
      }

      const ageMs = now.getTime() - fetchedAt;

      if (!Number.isNaN(fetchedAt) && ageMs >= 0 && ageMs < RECONCILIATION_TTL_MS) {
        // Cache is fresh (< 1 hour). Check if active DB records exist.
        const countRows = await runQuery(
          `SELECT COUNT(*) as cnt
           FROM accessible_transit_facility_alerts
           WHERE facility_name LIKE '%· 營運通報'
             AND (facility_id IS NULL OR facility_id NOT LIKE '%-EL%')
             AND (end_time IS NULL OR end_time >= NOW())`,
        );

        const activeCnt = Number(countRows?.[0]?.cnt || 0);
        if (activeCnt > 0) {
          // Fresh cache and active baseline verified: bypass REST call to protect 3,000 monthly quota
          return {
            ok: true,
            bypassed: true,
            reason: "fresh_cache_and_active_records",
            activeCount: activeCnt,
          };
        }
      }
    }
  } catch (checkErr) {
    console.warn("[TDX-ColdStart] Cache check error, proceeding to snapshot:", checkErr);
  }

  // Baseline missing or stale: trigger sequential snapshot & reconciliation
  try {
    const res = await reconcileRailAlerts(deps);
    return {
      ok: res.ok,
      bypassed: false,
      reason: "snapshot_completed",
      activeCount: res.activeCount,
      resolvedCount: res.resolvedCount,
      ...(res.errors.length > 0 ? { error: res.errors.join("; ") } : {}),
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[TDX-ColdStart] Snapshot failed gracefully without blocking boot:", msg);
    return {
      ok: false,
      bypassed: false,
      reason: "snapshot_failed",
      error: msg,
    };
  }
}

/**
 * Runner function for the daily cron job at 04:16.
 */
export async function runTransitAlertsReconciliationSync(): Promise<{
  ok: boolean;
  activeCount: number;
  resolvedCount: number;
  errors: string[];
}> {
  const result = await reconcileRailAlerts();
  return {
    ok: result.ok,
    activeCount: result.activeCount,
    resolvedCount: result.resolvedCount,
    errors: result.errors,
  };
}
