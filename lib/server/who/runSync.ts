/**
 * WHO Disease Outbreak News (DON) sync — issue #596, parent #583 (全球動態
 * 地球). Backend-only (no UI in this ticket) — feeds a later, still-blocked
 * ticket for the 國際疫情 item's WHO-pin overlay.
 *
 * Egress: WHO's DON API (www.who.int/api/news/diseaseoutbreaknews) was
 * reachable directly (HTTP 200, live data) from the sandbox this was built
 * in on 2026-10-15. That is NOT the same thing as the production host being
 * able to reach it — this repo has a well-documented pattern of hosts
 * blocking datacentre IP ranges inconsistently (nhi.gov.tw blocks both the
 * production host AND a GitHub Actions runner; opendata.wra.gov.tw blocks
 * the host but not a runner — see docs/archive and
 * `memory:ops_host_ip_blocked_upstreams`). This sandbox has none of the SSH
 * secrets (SSH_HOST/SSH_PORT/SSH_USER/SSH_PRIVATE_KEY) that
 * `.github/workflows/egress-probe.yml`'s `probe-from-host` job and
 * `scripts/gha-egress-probe-host.mjs` need to actually test the production
 * host's own network — those are GitHub Actions Environment secrets this
 * session cannot read or exercise. (This is the exact same situation issue
 * #592's GDACS pipeline hit — see lib/server/gdacs/runSync.ts's matching
 * comment and its PR #617 description.)
 *
 * Per the issue's own instruction for this situation: this module
 * implements the direct-fetch path (httpGetText straight to who.int, no
 * GitHub-runner relay) as the default, and `www.who.int api/news DON list`
 * has been added to scripts/gha-egress-probe-host.mjs's target list so the
 * `probe-from-host` job is one workflow_dispatch away from confirming this
 * for real. **Before merging/deploying**, run that job against the real
 * production host. If it comes back blocked, this file needs to change to
 * the runner-fetch + SSH-loopback-POST pattern instead (see
 * scripts/lib/ssh-loopback.mjs and e.g. scripts/gha-facilities-geocode-batch.mjs
 * for the shape of that) — do not assume direct-fetch works in production
 * just because it worked here.
 */
import {
  createIngestionRun,
  finishIngestionRun,
  writeIngestionError,
} from "@/lib/server/logging/ingestionLogger";
import { withAdvisoryLock } from "@/lib/server/db/mysql";
import { fetchWhoDonArticles } from "@/lib/server/who/sources/who";
import { upsertWhoOutbreakNews, cleanupOldWhoOutbreakNews } from "@/lib/server/who/queries";

const SYNC_LOCK_NAME = "who_outbreak_news_sync_lock";
const RETENTION_DAYS = 180;

export interface WhoDonSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  error: string | null;
}

/**
 * Fetches the current WHO DON list and upserts it into who_outbreak_news.
 * On any failure (fetch error, parse error), the existing table contents
 * are left completely untouched — there is no DELETE/TRUNCATE anywhere in
 * this path, upsertWhoOutbreakNews() only ever INSERTs or UPDATEs rows it
 * has fresh data for — and the error is written to the shared
 * `ingest_errors` table via writeIngestionError (same mechanism
 * runGdacsSync/runFraudDomainsSync/the RSS pipeline use) so a WHO outage
 * shows up in the ingest-runs log instead of silently emptying the page
 * that reads this table.
 *
 * Takes its own MySQL advisory lock (same withAdvisoryLock pattern as
 * runGdacsSync) so an overrunning run is skipped rather than racing the
 * next scheduled tick.
 */
export async function runWhoDonSync(): Promise<WhoDonSyncResult> {
  const startedAt = new Date();
  const runId = await createIngestionRun("who-don-cron");

  const lockResult = await withAdvisoryLock(SYNC_LOCK_NAME, 1, async () => {
    try {
      const articles = await fetchWhoDonArticles();
      const { inserted, updated } = await upsertWhoOutbreakNews(articles);

      await finishIngestionRun({
        runId,
        status: "success",
        startedAt,
        fetchedCount: articles.length,
        insertedCount: inserted,
        updatedCount: updated,
        unchangedCount: Math.max(0, articles.length - inserted - updated),
        failedFeedsCount: 0,
        summaryJson: JSON.stringify({ source: "who-don", fetched: articles.length, inserted, updated }),
      });

      const result: WhoDonSyncResult = { fetched: articles.length, inserted, updated, error: null };
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown WHO DON sync error";
      await writeIngestionError({ runId, feedCode: "who-don", message });
      await finishIngestionRun({
        runId,
        status: "failed",
        startedAt,
        fetchedCount: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
        failedFeedsCount: 1,
        summaryJson: JSON.stringify({ source: "who-don" }),
        errorMessage: message,
      });
      const result: WhoDonSyncResult = { fetched: 0, inserted: 0, updated: 0, error: message };
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
      summaryJson: JSON.stringify({ source: "who-don", skipped: "lock_held" }),
      errorMessage: "Another WHO DON sync is currently running.",
    });
    return { fetched: 0, inserted: 0, updated: 0, error: null };
  }

  return lockResult.result;
}

export interface WhoDonCleanupResult {
  deleted: number;
  error: string | null;
}

/** Daily retention sweep — deletes who_outbreak_news rows published more than 180 days ago (see cleanupOldWhoOutbreakNews). */
export async function runWhoDonCleanup(): Promise<WhoDonCleanupResult> {
  try {
    const deleted = await cleanupOldWhoOutbreakNews(RETENTION_DAYS);
    return { deleted, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown WHO DON cleanup error";
    return { deleted: 0, error: message };
  }
}
