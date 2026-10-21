import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { withAdvisoryLock } from "@/lib/server/db/mysql";
import { fetchGdeltConflictEvents } from "@/lib/server/gdelt/sources/gdelt";
import { upsertConflictEvents, cleanupOldConflictEvents } from "@/lib/server/conflicts/queries";

const SYNC_LOCK_NAME = "conflicts_gdelt_sync_lock";
const RETENTION_DAYS = 30;

export interface ConflictsGdeltSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

/**
 * Fetches GDELT's latest CAMEO 19/20 event export and upserts it into
 * conflict_events (issue #774, parent #773). Same shape as
 * lib/server/gdacs/runSync.ts's runGdacsSync: on any failure (fetch error,
 * zip/parse error — GDELT needs no token, so there is no "missing
 * credential" failure mode to special-case, see
 * lib/server/gdelt/sources/gdelt.ts's own doc comment), the existing table
 * contents are left completely untouched (no DELETE/TRUNCATE anywhere in
 * this path) and the error is written to the shared `ingest_errors` table
 * via writeIngestionError — AC: "GDELT...API 逾時或無法連線時排程只記警告、不讓
 * health-web 崩潰".
 *
 * Takes its own MySQL advisory lock so an overrunning run is skipped rather
 * than racing the next scheduled tick (same withAdvisoryLock pattern as
 * runGdacsSync/runFraudDomainsSync).
 */
export async function runConflictsGdeltSync(): Promise<ConflictsGdeltSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("conflicts-gdelt-cron");

  const lockResult = await withAdvisoryLock(SYNC_LOCK_NAME, 1, async () => {
    try {
      const events = await fetchGdeltConflictEvents();
      const { inserted, updated } = await upsertConflictEvents(events);

      await finishIngestionRun({
        runId,
        status: "success",
        startedAt,
        fetchedCount: events.length,
        insertedCount: inserted,
        updatedCount: updated,
        unchangedCount: Math.max(0, events.length - inserted - updated),
        failedFeedsCount: 0,
        summaryJson: JSON.stringify({ source: "gdelt", fetched: events.length, inserted, updated }),
      });

      const result: ConflictsGdeltSyncResult = { fetched: events.length, inserted, updated, error: null };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown GDELT sync error";
      await writeIngestionError({ runId, feedCode: "conflicts-gdelt", message });
      await finishIngestionRun({
        runId,
        status: "failed",
        startedAt,
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedFeedsCount: 1,
        summaryJson: JSON.stringify({ source: "gdelt" }),
        errorMessage: message,
      });
      const result: ConflictsGdeltSyncResult = { fetched: 0, inserted: 0, updated: 0, error: message };
      return result;
    }
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
      summaryJson: JSON.stringify({ source: "gdelt", skipped: "lock_held" }),
      errorMessage: "Another GDELT conflicts sync is currently running.",
    });
    return { fetched: 0, inserted: 0, updated: 0, error: null };
  }

  return lockResult.result;
}

export interface ConflictsGdeltCleanupResult {
  deleted: number;
  error: string | null;
}

/** Daily retention sweep — deletes GDELT-sourced conflict_events rows older
 * than 30 days by event_date (see cleanupOldConflictEvents). Never throws —
 * a failed cleanup tick must not crash health-web's cron scheduler, same
 * convention as every other *Cleanup job in lib/server/cron/registerJobs.ts. */
export async function runConflictsGdeltCleanup(): Promise<ConflictsGdeltCleanupResult> {
  try {
    const deleted = await cleanupOldConflictEvents(RETENTION_DAYS);
    return { deleted, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GDELT conflicts cleanup error";
    return { deleted: 0, error: message };
  }
}
