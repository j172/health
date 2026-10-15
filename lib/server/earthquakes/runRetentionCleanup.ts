import { withAdvisoryLock } from "@/lib/server/db/mysql";
import type { ResultSetHeader } from "mysql2/promise";

const LOCK_NAME = "earthquakes_retention_cleanup_lock";

/**
 * Retention window for global_earthquakes (issue #582). Every reader of
 * this table (the earthquakes tool page, its foreign-language variants, the
 * homepage status widget) caps its lookback at 168 hours (7 days), but 30
 * is deliberately wider than that — kept as headroom for the future Dynamic
 * Earth feature's own page, not a bug.
 */
export const RETENTION_DAYS = 30;

// Same batched-DELETE pattern as scripts/cleanup-cwa-station-weather-duplicates.mjs
// and friends, just run in-process on a daily cron tick instead of as a
// one-off script: delete a bounded number of rows at a time with a short
// pause between batches, rather than one unbounded DELETE that would hold
// a long lock on a table the 5-minute earthquake sync is also writing to.
const BATCH_SIZE = 2000;
const PAUSE_BETWEEN_BATCHES_MS = 150;

export interface EarthquakeRetentionCleanupResult {
  /** false if another run (or an overlapping tick) already held the advisory lock. */
  ran: boolean;
  deleted: number;
}

/**
 * Daily cleanup: deletes global_earthquakes rows older than RETENTION_DAYS.
 * Takes out its own advisory lock (same withAdvisoryLock pattern as
 * runFraudDomainsSync) so an unusually slow run can't overlap with the next
 * scheduled tick.
 */
export async function runEarthquakeRetentionCleanup(): Promise<EarthquakeRetentionCleanupResult> {
  const lockResult = await withAdvisoryLock(LOCK_NAME, 1, async (conn) => {
    let deleted = 0;
    for (;;) {
      const [result] = await conn.query<ResultSetHeader>(
        "DELETE FROM global_earthquakes WHERE event_time < DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY) LIMIT ?",
        [RETENTION_DAYS, BATCH_SIZE],
      );
      deleted += result.affectedRows;
      if (result.affectedRows === 0) break;
      await new Promise((resolve) => setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS));
    }
    return deleted;
  });

  if (!lockResult.acquired) return { ran: false, deleted: 0 };
  return { ran: true, deleted: lockResult.result };
}
