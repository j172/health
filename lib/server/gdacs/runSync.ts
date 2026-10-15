/**
 * GDACS (Global Disaster Alert and Coordination System) sync — issue #592,
 * part of #583 (全球動態地球). Feeds the still-blocked 颱風/全球災害/地震疊色
 * tickets (#593/#594/#595); this ticket is backend-only, no UI.
 *
 * Egress: GDACS's event-list endpoint was reachable directly (HTTP 200,
 * live data) from the sandbox this was built in on 2026-10-14. That is NOT
 * the same thing as the production host being able to reach it — this repo
 * has a well-documented pattern of hosts blocking datacentre IP ranges
 * inconsistently (nhi.gov.tw blocks both the production host AND a GitHub
 * Actions runner; opendata.wra.gov.tw blocks the host but not a runner —
 * see docs/archive and `memory:ops_host_ip_blocked_upstreams`). This
 * sandbox has none of the SSH secrets (SSH_HOST/SSH_PORT/SSH_USER/
 * SSH_PRIVATE_KEY) that `.github/workflows/egress-probe.yml`'s
 * `probe-from-host` job and `scripts/gha-egress-probe-host.mjs` need to
 * actually test the production host's own network — those are GitHub
 * Actions Environment secrets this session cannot read or exercise.
 *
 * Per the issue's own instruction for this situation: this module
 * implements the direct-fetch path (httpGetText straight to gdacs.org, no
 * GitHub-runner relay) as the default. **Before merging**, run the
 * `probe-from-host` job in `.github/workflows/egress-probe.yml` (or add
 * gdacs.org to its target list) against the real production host. If that
 * comes back blocked, this file needs to change to the runner-fetch +
 * SSH-loopback-POST pattern instead (see scripts/lib/ssh-loopback.mjs and
 * e.g. scripts/gha-facilities-geocode-batch.mjs for the shape of that) —
 * do not assume direct-fetch works in production just because it worked
 * here.
 */
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { withAdvisoryLock } from "@/lib/server/db/mysql";
import { fetchGdacsEvents } from "@/lib/server/gdacs/sources/gdacs";
import { upsertGdacsEvents, cleanupEndedGdacsEvents } from "@/lib/server/gdacs/queries";

const SYNC_LOCK_NAME = "gdacs_events_sync_lock";
const RETENTION_DAYS = 30;

export interface GdacsSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

/**
 * Fetches the current GDACS event list and upserts it into gdacs_events.
 * On any failure (fetch error, parse error), the existing table contents
 * are left completely untouched — there is no DELETE/TRUNCATE anywhere in
 * this path, upsertGdacsEvents() only ever INSERTs or UPDATEs rows it has
 * fresh data for — and the error is written to the shared `ingest_errors`
 * table via writeIngestionError (same mechanism runFraudDomainsSync and
 * the RSS pipeline use) so a GDACS outage shows up in the ingest-runs log
 * instead of silently emptying the page that reads this table.
 *
 * Takes its own MySQL advisory lock (same withAdvisoryLock pattern as
 * runFraudDomainsSync) so an overrunning run is skipped rather than racing
 * the next scheduled tick.
 */
export async function runGdacsSync(): Promise<GdacsSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("gdacs-events-cron");

  const lockResult = await withAdvisoryLock(SYNC_LOCK_NAME, 1, async () => {
    try {
      const events = await fetchGdacsEvents();
      const { inserted, updated } = await upsertGdacsEvents(events);

      await finishIngestionRun({
        runId,
        status: "success",
        startedAt,
        fetchedCount: events.length,
        insertedCount: inserted,
        updatedCount: updated,
        unchangedCount: Math.max(0, events.length - inserted - updated),
        failedFeedsCount: 0,
        summaryJson: JSON.stringify({ source: "gdacs", fetched: events.length, inserted, updated }),
      });

      const result: GdacsSyncResult = { fetched: events.length, inserted, updated, error: null };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown GDACS sync error";
      await writeIngestionError({ runId, feedCode: "gdacs", message });
      await finishIngestionRun({
        runId,
        status: "failed",
        startedAt,
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedFeedsCount: 1,
        summaryJson: JSON.stringify({ source: "gdacs" }),
        errorMessage: message,
      });
      const result: GdacsSyncResult = { fetched: 0, inserted: 0, updated: 0, error: message };
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
      summaryJson: JSON.stringify({ source: "gdacs", skipped: "lock_held" }),
      errorMessage: "Another GDACS sync is currently running.",
    });
    return { fetched: 0, inserted: 0, updated: 0, error: null };
  }

  return lockResult.result;
}

export interface GdacsCleanupResult {
  deleted: number;
  error: string | null;
}

/** Daily retention sweep — deletes gdacs_events rows ended more than 30 days ago (see cleanupEndedGdacsEvents). */
export async function runGdacsCleanup(): Promise<GdacsCleanupResult> {
  try {
    const deleted = await cleanupEndedGdacsEvents(RETENTION_DAYS);
    return { deleted, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown GDACS cleanup error";
    return { deleted: 0, error: message };
  }
}
