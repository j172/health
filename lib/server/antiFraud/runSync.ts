import { withAdvisoryLock } from "@/lib/server/db/mysql";
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { fetchPolice176455FraudDomains, POLICE_176455_SOURCE_KEY } from "@/lib/server/antiFraud/sources/police176455";
import { fetchModa165027FraudDomains, MODA_165027_SOURCE_KEY } from "@/lib/server/antiFraud/sources/moda165027";
import { upsertFraudDomains } from "@/lib/server/antiFraud/queries";

const LOCK_NAME = "fraud_domains_sync_lock";
const MODA_LOCK_NAME = "moda_165027_sync_lock";

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

/**
 * Daily sync for the 165027 fraud-domain source (issue #567) — 數產署's
 * list updates almost daily (vs. 176455's monthly batch), filling the gap
 * between 176455's publishing cycles. Deliberately its own runner with its
 * own advisory lock (`moda_165027_sync_lock`, distinct from 176455's
 * `fraud_domains_sync_lock` above) rather than sharing one — the two run on
 * different cadences against the same table, and a lock is scoped to "one
 * sync job running at a time", not "one writer to this table at a time"
 * (chunkedUpsert's (domain, source) keying already makes concurrent writes
 * from different sources safe).
 *
 * NOT YET VERIFIED reachable from the production host (only confirmed live
 * from this development sandbox, 2026-10-14/15) — see this PR's
 * description. Several other MODA/MOI hosts block datacenter IPs outright
 * (see docs/domains memory on nhi.gov.tw); confirm this one specifically
 * before merging.
 */
export async function runModa165027Sync(): Promise<FraudDomainsSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("moda-165027-sync-cron");

  const lockResult = await withAdvisoryLock(MODA_LOCK_NAME, 1, async () => {
    try {
      const records = await fetchModa165027FraudDomains();
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
        summaryJson: JSON.stringify({ source: MODA_165027_SOURCE_KEY, fetched: records.length, inserted, updated }),
      });

      const result: FraudDomainsSyncResult = { fetched: records.length, inserted, updated, error: null };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown moda-165027 sync error";
      await writeIngestionError({
        runId,
        feedCode: MODA_165027_SOURCE_KEY,
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
        summaryJson: JSON.stringify({ source: MODA_165027_SOURCE_KEY }),
        errorMessage: message,
      });
      const result: FraudDomainsSyncResult = { fetched: 0, inserted: 0, updated: 0, error: message };
      return result;
    }
  });

  if (!lockResult.acquired) {
    await finishIngestionRun({
      runId,
      status: "failed",
      startedAt,
      fetchedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      unchangedCount: 0,
      failedFeedsCount: 0,
      summaryJson: JSON.stringify({ source: MODA_165027_SOURCE_KEY, skipped: "lock_held" }),
      errorMessage: "Another moda-165027 sync is currently running.",
    });
    return { fetched: 0, inserted: 0, updated: 0, error: null };
  }

  return lockResult.result;
}
