import cron from "node-cron";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { runRssIngestion } from "@/lib/server/rss/runIngestion";
import { runAqiSync } from "@/lib/server/aqi/runSync";
import { runCwaSync } from "@/lib/server/cwa/runSync";
import { runEarthquakeSync } from "@/lib/server/earthquakes/runSync";
import { buildDailyDraftQueue } from "@/lib/server/social/buildDailyDraftQueue";
import { runFacilityHoursSync } from "@/lib/server/facilities/runHoursSync";
import { assignMissingNewsCardImages } from "@/lib/server/news/cardImages";
import { runCulturalShowsSync } from "@/lib/server/culture/ingestShows";
import { runNpoActivitiesSync } from "@/lib/server/culture/ingestNpoActivities";
import { runPresidentialVisitSync } from "@/lib/server/culture/ingestPresidentialVisit";
import { runPublicArtSync } from "@/lib/server/culture/ingestPublicArt";
import { runCdcAlertsSync } from "@/lib/server/cdc/ingestCdcAlerts";
import { runWaterOutagesSync } from "@/lib/server/water/ingestWaterOutages";
import { runGreenProductsSync } from "@/lib/server/greenProducts/ingestGreenProducts";
import { runCarbonFootprintProductsSync } from "@/lib/server/carbonFootprint/ingestCarbonFootprintProducts";
import { runCarbonFootprintCoefficientsSync } from "@/lib/server/carbonFootprint/ingestCarbonFootprintCoefficients";
import { runAqxSync } from "@/lib/server/aqx/ingestAqx";
import { runWraSync, runWraCatalogSync } from "@/lib/server/wra/runSync";
import { submitRecentNewsToIndexNow } from "@/lib/server/seo/indexnow";
import { runCoolSpotsSync } from "@/lib/server/coolSpots/ingestCoolSpots";
import { runIaqPremisesSync } from "@/lib/server/iaqPremises/ingestIaqPremises";
import { runCleaningSquadsSync } from "@/lib/server/cleaningSquads/ingestCleaningSquads";
import { runGreenRestaurantsSync } from "@/lib/server/greenRestaurants/ingestGreenRestaurants";

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
const runGuarded = (
  logFile: string,
  run: () => Promise<unknown>,
): (() => Promise<void>) => {
  let running = false;
  return async () => {
    if (running) return;
    running = true;
    try {
      const summary = await run();
      await appendLog(logFile, { ok: true, summary });
    } catch (error) {
      await appendLog(logFile, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
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
  cron.schedule(
    "5,35 * * * *",
    runGuarded("rss-sync-cron.log", () => runRssIngestion("internal-cron")),
  );
  cron.schedule(
    "20,50 * * * *",
    runGuarded("aqi-sync-cron.log", () => runAqiSync()),
  );
  cron.schedule(
    "15,45 * * * *",
    runGuarded("cwa-sync-cron.log", () => runCwaSync()),
  );
  cron.schedule(
    "3,13,23,33,43,53 * * * *",
    runGuarded("earthquakes-sync-cron.log", () => runEarthquakeSync()),
  );
  // Once daily — no specific business requirement on exact hour, 8am
  // server-local keeps it clear of the denser :00-ish traffic from the jobs
  // above. See docs/specs/social-icons-and-post-drafts.md section 2.3.
  cron.schedule(
    "0 8 * * *",
    runGuarded("social-post-queue-cron.log", () => buildDailyDraftQueue()),
  );
  // The WRA drought source was removed on 2026-08-31 — see
  // docs/specs/drop-wra-drought-source.md. It used to be excluded from this
  // scheduler because opendata.wra.gov.tw answers this host with an F5 Shape
  // challenge rather than JSON, so it ran from a GitHub runner instead. It was
  // dropped for a different reason: the source is a historical bulletin log
  // going back to 2012, and none of its 15 active records falls inside the
  // 90-day freshness window the news pipeline now applies.
  // Weekly on Sunday at 4am — NHI updates clinic/pharmacy weekly service hours data weekly
  cron.schedule(
    "0 4 * * 0",
    runGuarded("facilities-hours-sync-cron.log", () => runFacilityHoursSync()),
  );
  // Every 10 minutes — decoupled from rss-sync (see
  // docs/specs/news-card-image-freshness-scheduling.md) so Pixabay
  // assignment cadence isn't limited by rss-sync's own overlap guard.
  // assignMissingNewsCardImages() already takes out its own MySQL GET_LOCK
  // (news_card_image_assignment_lock), so this is safe to run alongside any
  // other trigger of the same function without double-work.
  cron.schedule(
    "*/10 * * * *",
    runGuarded("news-card-images-cron.log", () =>
      assignMissingNewsCardImages(15),
    ),
  );
  // Cultural events sync every 6 hours (at :10 past)
  cron.schedule(
    "10 0,6,12,18 * * *",
    runGuarded("culture-shows-cron.log", async () => {
      const shows = await runCulturalShowsSync();
      const npo = await runNpoActivitiesSync();
      const presidential = await runPresidentialVisitSync();
      return { shows, npo, presidential };
    }),
  );
  // Public art sync daily at 3am
  cron.schedule(
    "0 3 * * *",
    runGuarded("public-art-cron.log", () => runPublicArtSync()),
  );
  // CDC international travel epidemic alerts sync every 12 hours (at 02:15 & 14:15)
  cron.schedule(
    "15 2,14 * * *",
    runGuarded("cdc-alerts-cron.log", () => runCdcAlertsSync()),
  );
  // Water outages sync every hour (at :25 past)
  cron.schedule(
    "25 * * * *",
    runGuarded("water-outages-cron.log", () => runWaterOutagesSync()),
  );
  // Green products sync daily at 4:30am
  cron.schedule(
    "30 4 * * *",
    runGuarded("green-products-cron.log", () => runGreenProductsSync()),
  );
  // Carbon footprint products (cfp_p_01) sync daily at 4:45am — dataset itself
  // updates monthly per MOENV's metadata, daily is just cheap headroom.
  cron.schedule(
    "45 4 * * *",
    runGuarded("carbon-footprint-products-cron.log", () => runCarbonFootprintProductsSync()),
  );
  // Carbon footprint coefficients (cfp_p_02) sync daily at 4:50am — same
  // cadence rationale as cfp_p_01 above (reference data, monthly-ish churn).
  cron.schedule(
    "50 4 * * *",
    runGuarded("carbon-footprint-coefficients-cron.log", () => runCarbonFootprintCoefficientsSync()),
  );
  // AQX_* extended air-quality datasets (issue #131) — five "wide" hourly
  // datasets plus three "narrow" single-reading ones (see lib/server/aqx/).
  // Some publish daily, some hourly; running every 30 minutes alongside the
  // core AQI sync is cheap headroom rather than a precision requirement.
  cron.schedule(
    "10,40 * * * *",
    runGuarded("aqx-sync-cron.log", () => runAqxSync()),
  );
  // WRA (經濟部水利署) 水位站監測 + 水庫即時營運狀況 (issue #135) — both are
  // near-realtime telemetry (stations update as often as every 10 minutes),
  // so every 30 minutes alongside aqi/cwa is the same cadence convention as
  // the rest of this weather-group cron block.
  cron.schedule(
    "8,38 * * * *",
    runGuarded("wra-sync-cron.log", () => runWraSync()),
  );
  // IndexNow daily refresh at 5:00am — submits latest 100 news articles to IndexNow / Bing
  cron.schedule(
    "0 5 * * *",
    runGuarded("indexnow-sync-cron.log", () => submitRecentNewsToIndexNow(100)),
  );
  // Cool spots (gis_p_82), IAQ Act premises (aqx_p_23), cleaning squads
  // (wr_s_04) — issue #156. Unlike green-products/carbon-footprint/aqx/wra,
  // these three had NO cron backstop at all and depended solely on
  // deploy-ftps.yml's "Seed culture shows..." step, whose scripts POST to
  // this app's own public hostname and get silently blocked by Cloudflare
  // bot protection (403 JS challenge) when called from the GitHub Actions
  // runner — that step reported "success" every time while inserting zero
  // rows for these three sources, since none of them self-heals via cron.
  // These datasets update irregularly per MOENV metadata, so daily is plenty
  // — same cadence rationale as the neighboring green-products/carbon
  // footprint jobs above, at unused minutes in the same off-peak window.
  // WRA reference catalogs (水庫代碼表 139336 + 水位測站站況 22227) — daily off-peak sync
  cron.schedule(
    "30 4 * * *",
    runGuarded("wra-catalog-sync-cron.log", () => runWraCatalogSync()),
  );
  cron.schedule(
    "33 4 * * *",
    runGuarded("cool-spots-cron.log", () => runCoolSpotsSync()),
  );
  cron.schedule(
    "38 4 * * *",
    runGuarded("iaq-premises-cron.log", () => runIaqPremisesSync()),
  );
  cron.schedule(
    "53 4 * * *",
    runGuarded("cleaning-squads-cron.log", () => runCleaningSquadsSync()),
  );
  // Green restaurants (gis_p_11) — issue #163, the one dataset left over
  // from #130/#156 pending confirmation it shares the same MOENV_GP_API_KEY
  // as gp_p_42/gp_p_43/gis_p_82 (it does). Same daily-cadence rationale as
  // the neighboring cool-spots/iaq-premises/cleaning-squads jobs above, at
  // an unused minute in the same off-peak window.
  cron.schedule(
    "58 4 * * *",
    runGuarded("green-restaurants-cron.log", () => runGreenRestaurantsSync()),
  );
};
