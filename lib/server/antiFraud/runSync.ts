import { withAdvisoryLock } from "@/lib/server/db/mysql";
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { fetchPolice176455FraudDomains, POLICE_176455_SOURCE_KEY } from "@/lib/server/antiFraud/sources/police176455";
import { upsertFraudDomains } from "@/lib/server/antiFraud/queries";

const LOCK_NAME = "fraud_domains_sync_lock";

export interface FraudDomainsSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

/**
 * Monthly sync for the 176455 fraud-domain source (issue #564). #567 will
 * add 165027 (daily) and 160055 (one-time) alongside this — kept as its own
 * runner/lock rather than folded into another job since its cadence and
 * dataset size (~93,840 rows, ~10MB) don't match anything else on the
 * schedule.
 *
 * Takes out its own MySQL advisory lock (same `withAdvisoryLock` pattern as
 * `runRssIngestion`) so a slow run that overruns into the next scheduled
 * tick is skipped rather than running twice concurrently — this source is
 * large enough that an overlapping run would double up on `chunkedUpsert`
 * round-trips for no benefit (the unique key makes the second run's writes
 * redundant, not wrong, but still wasted DB load).
 *
 * Failures are written to the existing `ingest_errors` table via
 * `writeIngestionError` (same mechanism the RSS pipeline and
 * `autoGeocode.ts` use) rather than a new error-tracking table.
 */
export async function runFraudDomainsSync(): Promise<FraudDomainsSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("fraud-domains-monthly-cron");

  const lockResult = await withAdvisoryLock(LOCK_NAME, 1, async () => {
    try {
      const records = await fetchPolice176455FraudDomains();
      const { inserted, updated } = await upsertFraudDomains(records);

      await finishIngestionRun({
        runId,
        status: "success",
        startedAt,
        fetchedCount: records.length,
        insertedCount: inserted,
        updatedCount: updated,
        unchangedCount: Math.max(0, records.length - inserted - updated),
        failedFeedsCount: 0,
        summaryJson: JSON.stringify({ source: POLICE_176455_SOURCE_KEY, fetched: records.length, inserted, updated }),
      });

      const result: FraudDomainsSyncResult = { fetched: records.length, inserted, updated, error: null };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fraud-domains sync error";
      await writeIngestionError({
        runId,
        feedCode: POLICE_176455_SOURCE_KEY,
        message,
      });
      await finishIngestionRun({
        runId,
        status: "failed",
        startedAt,
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedFeedsCount: 1,
        summaryJson: JSON.stringify({ source: POLICE_176455_SOURCE_KEY }),
        errorMessage: message,
      });
      const result: FraudDomainsSyncResult = { fetched: 0, inserted: 0, updated: 0, error: message };
      return result;
    }
  });

  if (!lockResult.acquired) {
    // Another run (the previous tick, still in flight) holds the lock —
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
      summaryJson: JSON.stringify({ source: POLICE_176455_SOURCE_KEY, skipped: "lock_held" }),
      errorMessage: "Another fraud-domains sync is currently running.",
    });
    return { fetched: 0, inserted: 0, updated: 0, error: null };
  }

  return lockResult.result;
}
