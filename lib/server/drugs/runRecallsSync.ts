import { withAdvisoryLock } from "@/lib/server/db/mysql";
import { createIngestionRun, finishIngestionRun, writeIngestionError } from "@/lib/server/logging/ingestionLogger";
import { replaceDrugRecallsSnapshot } from "@/lib/server/drugs/recallQueries";
import { DRUG_RECALL_SOURCE, fetchDrugRecalls } from "@/lib/server/drugs/sources/tfdaDrugRecalls";
import { runSource } from "@/lib/server/sync/runSource";

const LOCK_NAME = "drug_recalls_sync_lock";

/** ingest_errors.feed_code is VARCHAR(10) — keep this within it (the longer *_SOURCE_KEY constants elsewhere would not fit). Distinct from B-4's "drug_short". */
const DRUG_RECALL_FEED_CODE = "drug_recal";

export interface DrugRecallsSyncResult {
  datasetId: string;
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  /** Set when the stale-row delete was skipped because the snapshot looked broken (the upsert still happened). */
  reconcileSkippedReason: string | null;
  error: string | null;
}

const emptyResult = (error: string | null): DrugRecallsSyncResult => ({
  datasetId: DRUG_RECALL_SOURCE.datasetId,
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  reconcileSkippedReason: null,
  error,
});

/**
 * Weekly sync of the TFDA recalled-drug register (6947) into drug_recalls +
 * drug_recall_licenses (issue #675). One small JSON file (~700 KB), so no
 * memory concern; it goes through runSource so a failure is reported, not
 * thrown.
 *
 * An empty parse is reported as an error rather than a quiet success: the
 * register holds ~1,700 historical rows, so zero means a broken export, and
 * the snapshot reconcile must never see it as "everything was withdrawn".
 *
 * Takes out its own MySQL advisory lock (distinct from the shortage sync's) so
 * an overrunning tick or a manual trigger that lands on top of the cron is
 * skipped rather than running twice. Failures — and a snapshot the reconcile
 * guard refused to delete against — are written to the shared ingest_errors
 * table via writeIngestionError.
 */
export async function runDrugRecallsSync(): Promise<DrugRecallsSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("drug-recalls-weekly-cron");

  const lockResult = await withAdvisoryLock(LOCK_NAME, 1, async () => {
    const outcome = await runSource<Omit<DrugRecallsSyncResult, "error">>(
      DRUG_RECALL_SOURCE.sourceKey,
      { datasetId: DRUG_RECALL_SOURCE.datasetId, fetched: 0, inserted: 0, updated: 0, deleted: 0, reconcileSkippedReason: null },
      async () => {
        const records = await fetchDrugRecalls();
        if (records.length === 0) {
          throw new Error(`TFDA drug recall ${DRUG_RECALL_SOURCE.datasetId} parsed to 0 rows; refusing to treat an empty export as the register`);
        }
        const snapshot = await replaceDrugRecallsSnapshot(records);
        return { datasetId: DRUG_RECALL_SOURCE.datasetId, fetched: records.length, ...snapshot };
      },
    );

    const result: DrugRecallsSyncResult = {
      datasetId: outcome.datasetId,
      fetched: outcome.fetched,
      inserted: outcome.inserted,
      updated: outcome.updated,
      deleted: outcome.deleted,
      reconcileSkippedReason: outcome.reconcileSkippedReason,
      error: outcome.error,
    };

    const problem = result.error ?? (result.reconcileSkippedReason ? `reconcile skipped: ${result.reconcileSkippedReason}` : null);
    if (problem) {
      await writeIngestionError({
        runId,
        feedCode: DRUG_RECALL_FEED_CODE,
        message: `[${DRUG_RECALL_SOURCE.datasetId}] ${problem}`,
        detail: { sourceKey: DRUG_RECALL_SOURCE.sourceKey, datasetId: DRUG_RECALL_SOURCE.datasetId },
      });
    }

    const failed = result.error !== null;
    await finishIngestionRun({
      runId,
      status: failed ? "failed" : "success",
      startedAt,
      fetchedCount: result.fetched,
      insertedCount: result.inserted,
      updatedCount: result.updated,
      unchangedCount: Math.max(0, result.fetched - result.inserted - result.updated),
      failedFeedsCount: failed ? 1 : 0,
      summaryJson: JSON.stringify({ source: "tfda_drug_recalls", ...result }),
      errorMessage: result.error ?? undefined,
    });

    return result;
  });

  if (!lockResult.acquired) {
    // Another run (the previous tick, or a manual trigger) holds the lock —
    // skip quietly rather than failing; this is expected, not an error.
    await finishIngestionRun({
      runId,
      status: "failed",
      startedAt,
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedFeedsCount: 0,
      summaryJson: JSON.stringify({ source: "tfda_drug_recalls", skipped: "lock_held" }),
      errorMessage: "Another drug-recalls sync is currently running.",
    });
    return emptyResult(null);
  }

  return lockResult.result;
}
