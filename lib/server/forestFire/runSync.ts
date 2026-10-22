/**
 * 林火風險 (MOA ForestFireAlertWCF) sync — B-12, issue #672 (docs/2.0/
 * track-b-opendata-phase2-3-spec.md section 2.4 D-2). Feeds the forest-fire block
 * on /tools/outdoor-safety via /api/outdoor-safety/forest-fire.
 *
 * Egress: data.moa.gov.tw is already reached by the production host for
 * debris flow (pest alerts used it too until retired by issue #788), but
 * this `/api/v1/` path has no probe record from the
 * production host (spec section 3). This module therefore implements the plain
 * direct-fetch path and relies on the first post-deploy run being verified
 * (the PR lists it as a TODO). If it turns out to be blocked, switch to the
 * runner-fetch + SSH-loopback-POST pattern (scripts/lib/ssh-loopback.mjs) — do
 * not assume it works just because it works from a developer machine.
 */
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { withAdvisoryLock } from "@/lib/server/db/mysql";
import { fetchForestFireJson } from "./fetchForestFire";
import { parseForestFire, taipeiDate } from "./parse";
import { getForestFireSite } from "./data/forestFireSites";
import { upsertForestFireAlerts } from "./queries";

const SYNC_LOCK_NAME = "forest_fire_alerts_sync_lock";
const FEED_CODE = "forest-fire";
/** Cap on how many site codes are copied into an ingest_errors detail blob. */
const MAX_DETAIL_CODES = 70;

export interface ForestFireSyncResult {
  /** Asia/Taipei date the sync asked the upstream for. */
  today: string;
  /** Today's rows accepted (known level, no upstream error). */
  fetched: number;
  inserted: number;
  updated: number;
  /** Today's rows rejected for an unknown / contradictory level. */
  unknownLevel: number;
  /** Today's rows rejected because upstream flagged an error. */
  errored: number;
  /** Accepted rows whose site code has no coordinate seed entry. */
  unseeded: number;
  /** True when the upstream had no rows for today yet (a normal early-morning answer; nothing written). */
  emptyForToday: boolean;
  error: string | null;
}

const emptyResult = (today: string): ForestFireSyncResult => ({
  today,
  fetched: 0,
  inserted: 0,
  updated: 0,
  unknownLevel: 0,
  errored: 0,
  unseeded: 0,
  emptyForToday: false,
  error: null,
});

/**
 * Fetches today's forest-fire levels and upserts them into forest_fire_alerts.
 *
 * On any failure (HTTP error, bad JSON, non-array payload) the existing table
 * contents are left untouched — there is no DELETE/TRUNCATE anywhere in this
 * path — and the error is written to `ingest_errors` (same mechanism as the WHO
 * / GDACS / anti-fraud syncs), so an upstream outage shows up in the ingest-runs
 * log instead of silently emptying the page. Rows with an unknown level or an
 * upstream error flag are logged to `ingest_errors` too but are never written
 * (and therefore never shown as 安全).
 *
 * Takes its own MySQL advisory lock so an overrunning tick is skipped rather
 * than racing the next one.
 */
export async function runForestFireSync(now: Date = new Date()): Promise<ForestFireSyncResult> {
  const startedAt = new Date();
  const today = taipeiDate(now);
  const runId = await createIngestionRun("forest-fire-cron");

  const lockResult = await withAdvisoryLock(SYNC_LOCK_NAME, 1, async () => {
    try {
      const payload = await fetchForestFireJson(today);
      const parsed = parseForestFire(payload, today);
      const unseeded = parsed.rows.filter((row) => !getForestFireSite(row.siteCode));

      const { inserted, updated } = await upsertForestFireAlerts(parsed.rows);

      const anomalies =
        parsed.unknownLevel.length + parsed.errored.length + parsed.malformed + unseeded.length;
      if (anomalies > 0) {
        await writeIngestionError({
          runId,
          feedCode: FEED_CODE,
          message:
            `ForestFireAlertWCF anomalies for ${today}: ${parsed.unknownLevel.length} unknown level, ` +
            `${parsed.errored.length} upstream error, ${parsed.malformed} malformed, ` +
            `${unseeded.length} site(s) missing from the coordinate seed (rows not shown as safe)`,
          detail: {
            unknownLevel: parsed.unknownLevel.slice(0, MAX_DETAIL_CODES),
            errored: parsed.errored.slice(0, MAX_DETAIL_CODES),
            unseeded: unseeded.slice(0, MAX_DETAIL_CODES).map((r) => ({ siteCode: r.siteCode, name: r.name })),
          },
        });
      }

      const emptyForToday = parsed.rows.length === 0;
      await finishIngestionRun({
        runId,
        status: "success",
        startedAt,
        fetchedCount: parsed.rows.length,
        insertedCount: inserted,
        updatedCount: updated,
        unchangedCount: Math.max(0, parsed.rows.length - inserted - updated),
        failedFeedsCount: 0,
        summaryJson: JSON.stringify({
          source: FEED_CODE,
          today,
          accepted: parsed.rows.length,
          unknownLevel: parsed.unknownLevel.length,
          errored: parsed.errored.length,
          malformed: parsed.malformed,
          ignoredNotToday: parsed.ignoredNotToday,
          duplicates: parsed.duplicates,
          unseeded: unseeded.length,
          emptyForToday,
        }),
      });

      const result: ForestFireSyncResult = {
        today,
        fetched: parsed.rows.length,
        inserted,
        updated,
        unknownLevel: parsed.unknownLevel.length,
        errored: parsed.errored.length,
        unseeded: unseeded.length,
        emptyForToday,
        error: null,
      };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown forest fire sync error";
      await writeIngestionError({ runId, feedCode: FEED_CODE, message });
      await finishIngestionRun({
        runId,
        status: "failed",
        startedAt,
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedFeedsCount: 1,
        summaryJson: JSON.stringify({ source: FEED_CODE, today }),
        errorMessage: message,
      });
      return { ...emptyResult(today), error: message };
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
      summaryJson: JSON.stringify({ source: FEED_CODE, skipped: "lock_held" }),
      errorMessage: "Another forest fire sync is currently running.",
    });
    return emptyResult(today);
  }

  return lockResult.result;
}
