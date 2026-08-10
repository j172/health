import cron from "node-cron";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { runRssIngestion } from "@/lib/server/rss/runIngestion";
import { runAqiSync } from "@/lib/server/aqi/runSync";
import { runCwaSync } from "@/lib/server/cwa/runSync";
import { runEarthquakeSync } from "@/lib/server/earthquakes/runSync";
import { buildDailyDraftQueue } from "@/lib/server/social/buildDailyDraftQueue";
import { runWraDroughtSync } from "@/lib/server/wra/runSync";

const LOG_DIR = path.join(process.cwd(), "logs");

/**
 * Appends one JSON-summary line to logs/{fileName}, creating the logs/
 * directory first if it doesn't exist yet. Preserves the same log file paths
 * the crontab's `curl ... >> logs/{job}-cron.log 2>&1` redirection used to
 * write, so existing `tail -f` habits on the host keep working.
 */
const appendLog = async (fileName: string, line: unknown): Promise<void> => {
  await mkdir(LOG_DIR, { recursive: true });
  await appendFile(path.join(LOG_DIR, fileName), `${JSON.stringify(line)}\n`);
};

/**
 * Wraps a sync job with an in-memory overlap guard — if the previous tick is
 * still running when the next one fires, the new tick is skipped rather than
 * running concurrently — and JSON-summary logging to the job's log file.
 * Replaces the crontab's `curl --max-time`, which only abandoned the client
 * side of the request while the server handler kept running past the
 * timeout.
 */
const runGuarded = (logFile: string, run: () => Promise<unknown>): (() => Promise<void>) => {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const summary = await run();
      await appendLog(logFile, { ok: true, summary });
    } catch (error) {
      await appendLog(logFile, { ok: false, error: error instanceof Error ? error.message : String(error) });
    } finally {
      running = false;
    }
  };
};

/**
 * Registers the in-process sync jobs. The first four used to be driven by
 * system crontab entries hitting Next.js API routes over an HTTP loopback
 * call (see docs/specs/in-app-cron-scheduler.md); the social-post draft
 * queue job is new (docs/specs/social-icons-and-post-drafts.md) but follows
 * the exact same in-process pattern. Called once from instrumentation.ts.
 * Each job is a direct, in-process function call — no HTTP, no secret
 * headers — since there is no longer an external caller to authenticate.
 * The pm2-ensure-running crontab entry stays in the system crontab and is
 * untouched by this module.
 */
export const registerCronJobs = (): void => {
  cron.schedule("5,35 * * * *", runGuarded("rss-sync-cron.log", () => runRssIngestion("internal-cron")));
  cron.schedule("20,50 * * * *", runGuarded("aqi-sync-cron.log", () => runAqiSync()));
  cron.schedule("15,45 * * * *", runGuarded("cwa-sync-cron.log", () => runCwaSync()));
  cron.schedule("3,13,23,33,43,53 * * * *", runGuarded("earthquakes-sync-cron.log", () => runEarthquakeSync()));
  // Once daily — no specific business requirement on exact hour, 8am
  // server-local keeps it clear of the denser :00-ish traffic from the jobs
  // above. See docs/specs/social-icons-and-post-drafts.md section 2.3.
  cron.schedule("0 8 * * *", runGuarded("social-post-queue-cron.log", () => buildDailyDraftQueue()));
  // WRA's drought/water-restriction bulletin doesn't update hourly — daily
  // is plenty. See docs/specs/phase5-wra-drought-alerts.md section 5.
  cron.schedule("0 7 * * *", runGuarded("wra-drought-sync-cron.log", () => runWraDroughtSync()));
};
