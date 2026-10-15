import { withAdvisoryLock } from "@/lib/server/db/mysql";
import { createIngestionRun, finishIngestionRun, writeIngestionError } from "@/lib/server/logging/ingestionLogger";
import { replaceDrugShortagesSnapshot } from "@/lib/server/drugs/shortageQueries";
import { DRUG_SHORTAGE_SOURCES, fetchDrugShortages } from "@/lib/server/drugs/sources/tfdaDrugShortages";
import { runSource } from "@/lib/server/sync/runSource";

const LOCK_NAME = "drug_shortages_sync_lock";

/** ingest_errors.feed_code is VARCHAR(10) — keep this within it (the longer *_SOURCE_KEY constants elsewhere would not fit). */
const DRUG_SHORTAGE_FEED_CODE = "drug_short";

export interface DrugShortagesSourceResult {
  sourceKey: string;
  datasetId: string;
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  /** Set when the stale-row delete was skipped because the snapshot looked broken (the upsert still happened). */
  reconcileSkippedReason: string | null;
  error: string | null;
}

export interface DrugShortagesSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  sources: DrugShortagesSourceResult[];
  error: string | null;
}

const emptyResult = (error: string | null): DrugShortagesSyncResult => ({
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  sources: [],
  error,
});

/**
 * Weekly sync of the two TFDA drug-shortage lists (54504 有替代 / 54505 無替代)
 * into drug_shortages (issue #670). Each dataset goes through runSource, so one
 * failing (or empty) list never blocks the other. 54505 is an empty list today
 * (a single "沒有資料" placeholder row) — that is a successful run of 0 rows,
 * not an error.
 *
 * Takes out its own MySQL advisory lock (same withAdvisoryLock pattern as
 * runFraudDomainsSync) so an overrunning tick or a manual trigger that lands
 * on top of the cron is skipped rather than running twice. Failures — and a
 * snapshot the reconcile guard refused to delete against — are written to the
 * shared ingest_errors table via writeIngestionError.
 */
export async function runDrugShortagesSync(): Promise<DrugShortagesSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("drug-shortages-weekly-cron");

  const lockResult = await withAdvisoryLock(LOCK_NAME, 1, async () => {
    const sources: DrugShortagesSourceResult[] = [];

    for (const source of DRUG_SHORTAGE_SOURCES) {
      const result = await runSource<Omit<DrugShortagesSourceResult, "sourceKey" | "error">>(
        source.sourceKey,
        { datasetId: source.datasetId, fetched: 0, inserted: 0, updated: 0, deleted: 0, reconcileSkippedReason: null },
        async () => {
          const { records, noDataPlaceholder } = await fetchDrugShortages(source);
          const snapshot = await replaceDrugShortagesSnapshot(source, records, noDataPlaceholder);
          return { datasetId: source.datasetId, fetched: records.length, ...snapshot };
        },
      );
      sources.push(result);

      const problem = result.error ?? (result.reconcileSkippedReason ? `reconcile skipped: ${result.reconcileSkippedReason}` : null);
      if (problem) {
        await writeIngestionError({
          runId,
          feedCode: DRUG_SHORTAGE_FEED_CODE,
          message: `[${source.datasetId}] ${problem}`,
          detail: { sourceKey: source.sourceKey, datasetId: source.datasetId },
        });
      }
    }

    const fetched = sources.reduce((n, s) => n + s.fetched, 0);
    const inserted = sources.reduce((n, s) => n + s.inserted, 0);
    const updated = sources.reduce((n, s) => n + s.updated, 0);
    const deleted = sources.reduce((n, s) => n + s.deleted, 0);
    const failed = sources.filter((s) => s.error);
    const error = failed.length > 0 ? failed.map((s) => `[${s.datasetId}] ${s.error}`).join("; ") : null;

    await finishIngestionRun({
      runId,
      status: failed.length > 0 ? "failed" : "success",
      startedAt,
      fetchedCount: fetched,
      insertedCount: inserted,
      updatedCount: updated,
      unchangedCount: Math.max(0, fetched - inserted - updated),
      failedFeedsCount: failed.length,
      summaryJson: JSON.stringify({ source: "tfda_drug_shortages", fetched, inserted, updated, deleted, sources }),
      errorMessage: error ?? undefined,
    });

    const result: DrugShortagesSyncResult = { fetched, inserted, updated, deleted, sources, error };
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
      summaryJson: JSON.stringify({ source: "tfda_drug_shortages", skipped: "lock_held" }),
      errorMessage: "Another drug-shortages sync is currently running.",
    });
    return emptyResult(null);
  }

  return lockResult.result;
}
