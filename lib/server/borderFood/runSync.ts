import { withAdvisoryLock } from "@/lib/server/db/mysql";
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { fetchBorderFoodRejections, BORDER_FOOD_SOURCE_KEY } from "@/lib/server/borderFood/sources/fdaBorderRejections";
import {
  countBorderFoodRejections,
  deleteBorderFoodRejectionsNotSyncedSince,
  upsertBorderFoodRejections,
} from "@/lib/server/borderFood/queries";
import { evaluateSnapshotGuard } from "@/lib/server/borderFood/reconcile";

const LOCK_NAME = "border_food_rejections_sync_lock";

export interface BorderFoodRejectionsSyncResult {
  /** Merged records parsed from the upstream file. */
  fetched: number;
  /** Raw upstream rows before the identical-row merge. */
  rawRows: number;
  inserted: number;
  updated: number;
  /** Rows swept because the upstream no longer lists them. */
  removed: number;
  error: string | null;
}

const EMPTY_RESULT: BorderFoodRejectionsSyncResult = {
  fetched: 0,
  rawRows: 0,
  inserted: 0,
  updated: 0,
  removed: 0,
  error: null,
};

/**
 * Weekly sync of the FDA 邊境查驗不合格食品 list (data.gov.tw 6133, issue
 * #671). The table is a rolling snapshot: fetch + parse FIRST, then run the
 * snapshot guard (an empty or sharply-shrunk response is treated as an
 * anomalous source — nothing is written and the failure lands in
 * `ingest_errors`), then upsert, and only after the upsert succeeded sweep the
 * rows the upstream no longer lists. A failed fetch therefore can never empty
 * the table.
 *
 * Takes its own MySQL advisory lock (same `withAdvisoryLock` pattern as
 * `runFraudDomainsSync`) so an overrunning run is skipped rather than racing
 * the next tick or a manual admin trigger.
 */
export async function runBorderFoodRejectionsSync(): Promise<BorderFoodRejectionsSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("border-food-rejections-weekly-cron");

  const lockResult = await withAdvisoryLock(LOCK_NAME, 1, async () => {
    try {
      const parsed = await fetchBorderFoodRejections();

      const previousCount = await countBorderFoodRejections();
      const guard = evaluateSnapshotGuard(parsed.records.length, previousCount);
      if (!guard.ok) {
        throw new Error(guard.reason ?? "Snapshot guard rejected the upstream response");
      }

      const { inserted, updated, syncedAt } = await upsertBorderFoodRejections(parsed.records);
      const removed = await deleteBorderFoodRejectionsNotSyncedSince(syncedAt);

      await finishIngestionRun({
        runId,
        status: "success",
        startedAt,
        fetchedCount: parsed.records.length,
        insertedCount: inserted,
        updatedCount: updated,
        unchangedCount: Math.max(0, parsed.records.length - inserted - updated),
        failedFeedsCount: 0,
        summaryJson: JSON.stringify({
          source: BORDER_FOOD_SOURCE_KEY,
          rawRows: parsed.rawRowCount,
          fetched: parsed.records.length,
          mergedDuplicateRows: parsed.mergedDuplicateRows,
          skippedRows: parsed.skippedRowCount,
          inserted,
          updated,
          removed,
        }),
      });

      const result: BorderFoodRejectionsSyncResult = {
        fetched: parsed.records.length,
        rawRows: parsed.rawRowCount,
        inserted,
        updated,
        removed,
        error: null,
      };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown border-food-rejections sync error";
      await writeIngestionError({ runId, feedCode: BORDER_FOOD_SOURCE_KEY, message });
      await finishIngestionRun({
        runId,
        status: "failed",
        startedAt,
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedFeedsCount: 1,
        summaryJson: JSON.stringify({ source: BORDER_FOOD_SOURCE_KEY }),
        errorMessage: message,
      });
      const result: BorderFoodRejectionsSyncResult = { ...EMPTY_RESULT, error: message };
      return result;
    }
  });

  if (!lockResult.acquired) {
    // The previous run is still in flight — skip quietly, this is expected.
    await finishIngestionRun({
      runId,
      status: "failed",
      startedAt,
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedFeedsCount: 0,
      summaryJson: JSON.stringify({ source: BORDER_FOOD_SOURCE_KEY, skipped: "lock_held" }),
      errorMessage: "Another border-food-rejections sync is currently running.",
    });
    return { ...EMPTY_RESULT };
  }

  return lockResult.result;
}
