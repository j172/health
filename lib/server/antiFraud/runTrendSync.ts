import { withAdvisoryLock } from "@/lib/server/db/mysql";
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { fetchPolice172159Stats, POLICE_172159_SOURCE_KEY } from "@/lib/server/antiFraud/sources/police172159";
import { fetchFsc11198Stats, FSC_11198_SOURCE_KEY } from "@/lib/server/antiFraud/sources/fsc11198";
import {
  upsertPoliceFraudInterdictionStats,
  upsertFscFraudAdStats,
} from "@/lib/server/antiFraud/trendQueries";

export interface TrendSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

/**
 * Shared skeleton for both trend-stat syncs below — same
 * createIngestionRun/withAdvisoryLock/finishIngestionRun/writeIngestionError
 * wiring as `runFraudDomainsSync` (lib/server/antiFraud/runSync.ts), just
 * parameterized over which fetch+upsert pair and which lock name to use.
 * Both of these sources are tiny (24 and ~97 rows respectively) compared to
 * fraud_domains' ~93,840, but they get their own advisory lock each anyway
 * — a slow run overlapping the next scheduled tick should still be skipped
 * rather than double-running, same reasoning as that file's doc comment.
 */
async function runTrendSync(
  lockName: string,
  triggerType: string,
  sourceKey: string,
  fetchRecords: () => Promise<unknown[]>,
  upsertRecords: (records: unknown[]) => Promise<{ inserted: number; updated: number }>,
): Promise<TrendSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun(triggerType);

  const lockResult = await withAdvisoryLock(lockName, 1, async () => {
    try {
      const records = await fetchRecords();
      const { inserted, updated } = await upsertRecords(records);

      await finishIngestionRun({
        runId,
        status: "success",
        startedAt,
        fetchedCount: records.length,
        insertedCount: inserted,
        updatedCount: updated,
        unchangedCount: Math.max(0, records.length - inserted - updated),
        failedFeedsCount: 0,
        summaryJson: JSON.stringify({ source: sourceKey, fetched: records.length, inserted, updated }),
      });

      const result: TrendSyncResult = { fetched: records.length, inserted, updated, error: null };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : `Unknown ${sourceKey} sync error`;
      await writeIngestionError({ runId, feedCode: sourceKey, message });
      await finishIngestionRun({
        runId,
        status: "failed",
        startedAt,
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedFeedsCount: 1,
        summaryJson: JSON.stringify({ source: sourceKey }),
        errorMessage: message,
      });
      const result: TrendSyncResult = { fetched: 0, inserted: 0, updated: 0, error: message };
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
      summaryJson: JSON.stringify({ source: sourceKey, skipped: "lock_held" }),
      errorMessage: `Another ${sourceKey} sync is currently running.`,
    });
    return { fetched: 0, inserted: 0, updated: 0, error: null };
  }

  return lockResult.result;
}

/** Monthly sync for 172159 (警政署打詐儀錶板打擊詐欺成效), issue #570. */
export async function runPoliceFraudInterdictionStatsSync(): Promise<TrendSyncResult> {
  return runTrendSync(
    "police_fraud_interdiction_stats_sync_lock",
    "police-172159-stats-monthly-cron",
    POLICE_172159_SOURCE_KEY,
    fetchPolice172159Stats as () => Promise<unknown[]>,
    upsertPoliceFraudInterdictionStats as (records: unknown[]) => Promise<{ inserted: number; updated: number }>,
  );
}

/** Weekly sync for 11198 (金管會打詐儀表板違規投資廣告), issue #570. */
export async function runFscFraudAdStatsSync(): Promise<TrendSyncResult> {
  return runTrendSync(
    "fsc_fraud_ad_stats_sync_lock",
    "fsc-11198-stats-weekly-cron",
    FSC_11198_SOURCE_KEY,
    fetchFsc11198Stats as () => Promise<unknown[]>,
    upsertFscFraudAdStats as (records: unknown[]) => Promise<{ inserted: number; updated: number }>,
  );
}
