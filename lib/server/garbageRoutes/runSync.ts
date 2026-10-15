/**
 * Daily sync of garbage-truck route stops (issue #674 / B-16) — 臺北市 136515
 * and 新北市 125664 into garbage_route_stops. Backs the 路線與收運時間 tab of
 * the 垃圾車與清潔隊 page (slug cleaning-squads).
 *
 * Egress: both hosts (data.taipei, data.ntpc.gov.tw) fetched fine from a
 * developer machine on 2026-10-15 and already back live sources of this site,
 * but these exact resource paths have no recorded probe from the production
 * host (docs/2.0/track-b-opendata-phase2-3-spec.md §3). The first post-deploy
 * run of this sync is that probe: a blocked host surfaces as an ingest_errors
 * row for that city and leaves the table untouched — see the PR's post-deploy
 * checklist. Fetching goes through lib/server/net/httpClient.ts (never global
 * fetch) like every other source.
 *
 * Each city is replaced as one snapshot and isolated from the other: a city's
 * failure is recorded and the loop moves on. Rows a successful run did not see
 * are pruned, but only when the fetch looks complete (reconcile.ts); an empty
 * or sharply smaller response keeps the existing rows and is written to
 * ingest_errors so a dead upstream is visible instead of silently emptying the
 * page that reads this table.
 *
 * Takes its own MySQL advisory lock (same withAdvisoryLock pattern as the
 * anti-fraud syncs) so an overrunning run is skipped rather than racing the
 * next tick.
 *
 * Memory / event loop: this runs inside health-web (768 MB heap cap, ~450 MB
 * already resident, serving traffic and every other cron). The first
 * production run restarted that process while 新北 (26.6k rows) was being
 * processed, so every step is now bounded: rows are parsed as a stream and
 * handed back to the event loop every few hundred rows, upserted in 200-row
 * statements with a hand-back after each, and a city's rows are released
 * before the next city starts. Each stage also writes one JSON line with the
 * heap / RSS at that moment (stageLog.ts), so a future crash names its step.
 */
import { withAdvisoryLock, utcNowSql } from "@/lib/server/db/mysql";
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { yieldToEventLoop } from "@/lib/server/sync/yieldToEventLoop";
import type { GarbageRouteCity, GarbageRouteSource, GarbageRouteStopRecord } from "@/lib/server/garbageRoutes/types";
import { fetchTaipeiRoutes, TAIPEI_136515_SOURCE_KEY } from "@/lib/server/garbageRoutes/sources/taipei136515";
import { fetchNtpcRoutes, NTPC_125664_SOURCE_KEY } from "@/lib/server/garbageRoutes/sources/ntpc125664";
import {
  countGarbageRouteStops,
  pruneUnseenGarbageRouteStops,
  upsertGarbageRouteStops,
} from "@/lib/server/garbageRoutes/queries";
import { decideSnapshotPrune } from "@/lib/server/garbageRoutes/reconcile";
import { createStageLogger, UPSERT_LOG_EVERY_BATCHES } from "@/lib/server/garbageRoutes/stageLog";

const SYNC_LOCK_NAME = "garbage_routes_sync_lock";

export const GARBAGE_ROUTE_SOURCES: readonly GarbageRouteSource[] = [
  { city: "taipei", sourceKey: TAIPEI_136515_SOURCE_KEY, fetch: fetchTaipeiRoutes },
  { city: "new_taipei", sourceKey: NTPC_125664_SOURCE_KEY, fetch: fetchNtpcRoutes },
];

export interface GarbageRouteCitySyncResult {
  city: GarbageRouteCity;
  fetched: number;
  inserted: number;
  updated: number;
  pruned: number;
  /** Why stale rows were deliberately kept (empty / anomalously small fetch), if they were. */
  pruneSkippedReason: string | null;
  error: string | null;
}

export interface GarbageRoutesSyncResult {
  cities: GarbageRouteCitySyncResult[];
  /** Set only when the whole run did not happen (lock held elsewhere is NOT an error). */
  skipped: "lock_held" | null;
}

const emptyCityResult = (city: GarbageRouteCity): GarbageRouteCitySyncResult => ({
  city,
  fetched: 0,
  inserted: 0,
  updated: 0,
  pruned: 0,
  pruneSkippedReason: null,
  error: null,
});

export async function runGarbageRoutesSync(): Promise<GarbageRoutesSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("garbage-routes-cron");

  const lockResult = await withAdvisoryLock(SYNC_LOCK_NAME, 1, async () => {
    const results: GarbageRouteCitySyncResult[] = [];

    for (const source of GARBAGE_ROUTE_SOURCES) {
      const result = emptyCityResult(source.city);
      const stage = createStageLogger({ runId, city: source.city, runStartedAtMs: startedAt.getTime() });
      // Only this city's rows are ever held, and they are dropped (collectable) before the
      // next city starts — the two cities must never be resident together.
      let records: GarbageRouteStopRecord[] | null = null;
      try {
        stage("before_fetch");
        const previousCount = await countGarbageRouteStops(source.city);
        // Taken before the upsert so every row this run writes has synced_at >= it.
        const runStartedAtSql = utcNowSql();

        records = await source.fetch({ onStage: stage });
        const fetched = records.length;
        result.fetched = fetched;

        if (fetched > 0) {
          const { inserted, updated } = await upsertGarbageRouteStops(records, {
            onBatch: ({ batch, rowsDone, rowsTotal }) => {
              if (batch % UPSERT_LOG_EVERY_BATCHES === 0 && rowsDone < rowsTotal) {
                stage("after_upsert_batches", { batch, rowsDone, rowsTotal });
              }
            },
          });
          result.inserted = inserted;
          result.updated = updated;
        }
        records = null;
        stage("after_upsert", { fetched, inserted: result.inserted, updated: result.updated });

        const decision = decideSnapshotPrune({ fetched, previousCount });
        if (decision.prune) {
          result.pruned = await pruneUnseenGarbageRouteStops(source.city, runStartedAtSql);
          stage("after_prune", { pruned: result.pruned });
        } else {
          result.pruneSkippedReason = decision.reason;
          await writeIngestionError({ runId, feedCode: source.sourceKey, message: decision.reason });
          stage("after_prune", { pruned: 0, pruneSkipped: true });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown garbage-routes sync error";
        result.error = message;
        stage("city_failed", { error: message });
        await writeIngestionError({ runId, feedCode: source.sourceKey, message });
      }
      records = null;
      results.push(result);
      // Let the event loop (and the garbage collector) catch up before the next city's download.
      await yieldToEventLoop();
    }

    return results;
  });

  if (!lockResult.acquired) {
    // Previous tick still in flight — skip quietly, not an error.
    await finishIngestionRun({
      runId,
      status: "failed",
      startedAt,
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedFeedsCount: 0,
      summaryJson: JSON.stringify({ source: "garbage-routes", skipped: "lock_held" }),
      errorMessage: "Another garbage-routes sync is currently running.",
    });
    return { cities: [], skipped: "lock_held" };
  }

  const cities = lockResult.result;
  const failed = cities.filter((c) => c.error !== null || c.pruneSkippedReason !== null);
  const fetched = cities.reduce((sum, c) => sum + c.fetched, 0);
  const inserted = cities.reduce((sum, c) => sum + c.inserted, 0);
  const updated = cities.reduce((sum, c) => sum + c.updated, 0);

  await finishIngestionRun({
    runId,
    status: failed.length === 0 ? "success" : "failed",
    startedAt,
    fetchedCount: fetched,
    insertedCount: inserted,
    updatedCount: updated,
    unchangedCount: Math.max(0, fetched - inserted - updated),
    failedFeedsCount: failed.length,
    summaryJson: JSON.stringify({ source: "garbage-routes", cities }),
    errorMessage: failed.length === 0 ? undefined : failed.map((c) => `${c.city}: ${c.error ?? c.pruneSkippedReason}`).join("; "),
  });

  return { cities, skipped: null };
}
