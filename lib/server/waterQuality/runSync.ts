/**
 * 水質 (water quality) sync for the /tools/water-outages 水質 tab — issue #673
 * (Track B B-13). Monthly: 36605's catalogue says it refreshes every 3 months,
 * so a monthly tick is cheap headroom (cron `29 5 2 * *`, see registerJobs.ts).
 *
 * Structured as a list of independent steps (WATER_QUALITY_SYNC_STEPS) behind
 * one advisory lock and one ingest_runs row, so the second dataset planned for
 * this tab (B-14: 6308 淨水場檢驗結果 → water_plant_quality) is one new entry,
 * not a new job. A failing step is recorded in ingest_errors and does not stop
 * the others.
 *
 * Egress: www.water.gov.tw already serves the live 停水公告 pipeline from this
 * same host, so the direct fetch is expected to work in production; the first
 * post-deploy run (POST /api/admin/water-quality-sync) is what confirms it.
 */
import { utcNowSql, withAdvisoryLock } from "@/lib/server/db/mysql";
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { fetchWaterHardness, WATER_HARDNESS_FEED_CODE } from "@/lib/server/waterQuality/hardness";
import {
  countWaterHardness,
  deleteStaleWaterHardness,
  upsertWaterHardness,
} from "@/lib/server/waterQuality/queries";
import { planSnapshotReconcile } from "@/lib/server/waterQuality/reconcile";

const SYNC_LOCK_NAME = "water_quality_sync_lock";

export interface WaterQualityStepCounts {
  fetched: number;
  inserted: number;
  updated: number;
  /** Rows removed because the source no longer lists them. */
  deleted: number;
}

export interface WaterQualityStepResult extends WaterQualityStepCounts {
  key: string;
  error: string | null;
}

export interface WaterQualitySyncResult {
  steps: WaterQualityStepResult[];
  error: string | null;
}

interface WaterQualitySyncStep {
  /** Short stable id, used in the result and the ingest_runs summary. */
  key: string;
  /** `feed_code` written to ingest_errors when this step fails. */
  feedCode: string;
  run: (ctx: { runId: number }) => Promise<WaterQualityStepCounts>;
}

/**
 * 36605 鄉鎮總硬度 → water_hardness_township. Fetch first (throws on an
 * empty/failed snapshot, leaving the table untouched), upsert, then drop rows
 * the source no longer lists — but only when planSnapshotReconcile() says the
 * snapshot looks complete; a suspiciously small one is recorded as an ingest
 * error and the delete is skipped.
 */
const syncWaterHardness = async ({ runId }: { runId: number }): Promise<WaterQualityStepCounts> => {
  const rows = await fetchWaterHardness();
  const existingCount = await countWaterHardness();

  // Taken before the upsert: every row this run touches gets synced_at >= this,
  // every row it didn't keeps an older one.
  const syncStartedAtSql = utcNowSql();
  const { inserted, updated } = await upsertWaterHardness(rows);

  const plan = planSnapshotReconcile({ fetchedCount: rows.length, existingCount });
  let deleted = 0;
  if (plan.shouldDelete) {
    deleted = await deleteStaleWaterHardness(syncStartedAtSql);
  } else {
    await writeIngestionError({
      runId,
      feedCode: WATER_HARDNESS_FEED_CODE,
      message: `Water hardness snapshot has ${rows.length} rows vs ${existingCount} stored (${plan.reason}); stale-row delete skipped.`,
    });
  }

  return { fetched: rows.length, inserted, updated, deleted };
};

/**
 * Add further datasets for the 水質 tab here (e.g. B-14's 6308 淨水場檢驗結果).
 * Each step must be independently safe to fail: throw on a bad fetch, never
 * write a partial snapshot, and leave its own table alone when it throws.
 */
export const WATER_QUALITY_SYNC_STEPS: readonly WaterQualitySyncStep[] = [
  { key: "hardness", feedCode: WATER_HARDNESS_FEED_CODE, run: syncWaterHardness },
];

const sumCounts = (steps: WaterQualityStepResult[]) =>
  steps.reduce(
    (acc, s) => ({
      fetched: acc.fetched + s.fetched,
      inserted: acc.inserted + s.inserted,
      updated: acc.updated + s.updated,
      deleted: acc.deleted + s.deleted,
    }),
    { fetched: 0, inserted: 0, updated: 0, deleted: 0 },
  );

/**
 * Runs every WATER_QUALITY_SYNC_STEPS entry under one MySQL advisory lock (same
 * `withAdvisoryLock` pattern as runWhoDonSync/runFraudDomainsSync) so an
 * overrunning run is skipped, not raced. Never throws: failures land in
 * ingest_errors and in the returned result.
 */
export async function runWaterQualitySync(): Promise<WaterQualitySyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("water-quality-monthly-cron");

  const lockResult = await withAdvisoryLock(SYNC_LOCK_NAME, 1, async () => {
    const results: WaterQualityStepResult[] = [];

    for (const step of WATER_QUALITY_SYNC_STEPS) {
      try {
        const counts = await step.run({ runId });
        results.push({ key: step.key, ...counts, error: null });
      } catch (error) {
        const message = error instanceof Error ? error.message : `Unknown water-quality ${step.key} sync error`;
        await writeIngestionError({ runId, feedCode: step.feedCode, message });
        results.push({ key: step.key, fetched: 0, inserted: 0, updated: 0, deleted: 0, error: message });
      }
    }

    const failed = results.filter((r) => r.error !== null);
    const totals = sumCounts(results);
    await finishIngestionRun({
      runId,
      status: failed.length === 0 ? "success" : "failed",
      startedAt,
      fetchedCount: totals.fetched,
      insertedCount: totals.inserted,
      updatedCount: totals.updated,
      unchangedCount: Math.max(0, totals.fetched - totals.inserted - totals.updated),
      failedFeedsCount: failed.length,
      summaryJson: JSON.stringify({ source: "water-quality", steps: results }),
      errorMessage: failed.length > 0 ? failed.map((r) => `${r.key}: ${r.error}`).join("; ") : undefined,
    });

    const result: WaterQualitySyncResult = {
      steps: results,
      error: failed.length > 0 ? failed.map((r) => `${r.key}: ${r.error}`).join("; ") : null,
    };
    return result;
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
      summaryJson: JSON.stringify({ source: "water-quality", skipped: "lock_held" }),
      errorMessage: "Another water-quality sync is currently running.",
    });
    return { steps: [], error: null };
  }

  return lockResult.result;
}
