import cron from "node-cron";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { runRssIngestion } from "@/lib/server/rss/runIngestion";
import { runAqiSync } from "@/lib/server/aqi/runSync";
import { runCwaSync } from "@/lib/server/cwa/runSync";
import { runEarthquakeSync } from "@/lib/server/earthquakes/runSync";
import { runEarthquakeRetentionCleanup } from "@/lib/server/earthquakes/runRetentionCleanup";
import { buildDailyDraftQueue } from "@/lib/server/social/buildDailyDraftQueue";
import { runFacilityHoursSync } from "@/lib/server/facilities/runHoursSync";
import { assignMissingNewsCardImages } from "@/lib/server/news/cardImages";
import { runCulturalShowsSync } from "@/lib/server/culture/ingestShows";
import { runNpoActivitiesSync } from "@/lib/server/culture/ingestNpoActivities";
import { runSeinsightsEventsSync } from "@/lib/server/culture/ingestSeinsightsEvents";
import { runG0vEventsSync } from "@/lib/server/culture/ingestG0vEvents";
import { runPresidentialVisitSync } from "@/lib/server/culture/ingestPresidentialVisit";
import { runKumaEventsSync } from "@/lib/server/culture/ingestKumaEvents";
import { runPublicArtSync } from "@/lib/server/culture/ingestPublicArt";
import { runCdcAlertsSync } from "@/lib/server/cdc/ingestCdcAlerts";
import { runWaterOutagesSync } from "@/lib/server/water/ingestWaterOutages";
import { runWraWaterOutagesSync } from "@/lib/server/waterOutages/ingestWraWaterOutages";
import { runWaterQualitySync } from "@/lib/server/waterQuality/runSync";
import { runGreenProductsSync } from "@/lib/server/greenProducts/ingestGreenProducts";
import { runCarbonFootprintProductsSync } from "@/lib/server/carbonFootprint/ingestCarbonFootprintProducts";
import { runCarbonFootprintCoefficientsSync } from "@/lib/server/carbonFootprint/ingestCarbonFootprintCoefficients";
import { runAqxSync } from "@/lib/server/aqx/ingestAqx";
import { runWraSync, runWraCatalogSync, runWraIotSync } from "@/lib/server/wra/runSync";
import { runCoolSpotsSync } from "@/lib/server/coolSpots/ingestCoolSpots";
import { runIaqPremisesSync } from "@/lib/server/iaqPremises/ingestIaqPremises";
import { runCleaningSquadsSync } from "@/lib/server/cleaningSquads/ingestCleaningSquads";
import { runGarbageRoutesSync } from "@/lib/server/garbageRoutes/runSync";
import { runGreenRestaurantsSync } from "@/lib/server/greenRestaurants/ingestGreenRestaurants";
import { runYouBikeSync } from "@/lib/server/youbike/runSync";
import { runMetroAlertsSync } from "@/lib/server/metroAlerts/runSync";
import { runPestAlertsSync } from "@/lib/server/pestAlerts/runSync";
import { runForestFireSync } from "@/lib/server/forestFire/runSync";
import { runLatestBooksSync } from "@/lib/server/books/runSync";
import { runDrugShortagesSync } from "@/lib/server/drugs/runShortagesSync";
import { runPowerRealtimeSync, runPowerMixSync } from "@/lib/server/power/runSync";
import { runEmergencyRoomSync } from "@/lib/server/emergencyRooms/runSync";
import {
  runTransitAccessibilitySync,
  runTransitFacilityAlertsSync,
  runTransitBusSync,
} from "@/lib/server/transit/runSync";
import {
  runSeniorTourismSync,
  runSeniorTourismAlertsSync,
  runSeniorCardSync,
} from "@/lib/server/seniorTourism/runSync";
import { runFraudDomainsSync, runModa165027Sync } from "@/lib/server/antiFraud/runSync";
import {
  runPoliceFraudInterdictionStatsSync,
  runFscFraudAdStatsSync,
} from "@/lib/server/antiFraud/runTrendSync";
import { runGdacsSync, runGdacsCleanup } from "@/lib/server/gdacs/runSync";
import { runWhoDonSync, runWhoDonCleanup } from "@/lib/server/who/runSync";

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
 * Names of jobs currently mid-run, shared across every runGuarded() closure
 * — lets memory-monitor.log show not just "how much memory did this one job
 * use" but "were N jobs overlapping when memory spiked", since this process
 * runs 25+ of these on a shared 768MB heap (see docs/archive/specs/
 * cron-memory-monitoring.md, opened after a WASM OOM crash loop whose exact
 * memory-pressure source was never pinned down).
 */
const activeJobNames = new Set<string>();

const jobNameFromLogFile = (logFile: string): string =>
  logFile.replace(/-cron\.log$/, "");

export interface MemorySnapshotMb {
  rss: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

export const snapshotMemoryMb = (): MemorySnapshotMb => {
  const m = process.memoryUsage();
  const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
  return {
    rss: toMb(m.rss),
    heapUsed: toMb(m.heapUsed),
    external: toMb(m.external),
    arrayBuffers: toMb(m.arrayBuffers ?? 0),
  };
};

/**
 * Memory safety limits (in MB). When process memory crosses either threshold,
 * in-app cron jobs skip their execution tick rather than piling more memory
 * pressure onto the 768MB capped heap. This protects the live website from
 * RangeError: WebAssembly.instantiate() OOM crashes and 502 Bad Gateway outages.
 */
export const CRON_MEMORY_CEILING_RSS_MB = 620;
export const CRON_MEMORY_CEILING_HEAP_USED_MB = 550;

export const isMemoryUnderPressure = (
  mem: MemorySnapshotMb = snapshotMemoryMb(),
  rssLimit = CRON_MEMORY_CEILING_RSS_MB,
  heapLimit = CRON_MEMORY_CEILING_HEAP_USED_MB,
): boolean => mem.rss >= rssLimit || mem.heapUsed >= heapLimit;

/**
 * Wraps a sync job with an in-memory overlap guard — if the previous tick is
 * still running when the next one fires, the new tick is skipped rather than
 * running concurrently — and JSON-summary logging to the job's log file.
 * Replaces the crontab's `curl --max-time`, which only abandoned the client
 * side of the request while the server handler kept running past the
 * timeout.
 *
 * Also brackets every run with a memory-monitor.log entry (job name, memory
 * snapshot, and which other jobs were concurrently active) so a future OOM
 * can be traced to a specific job or a specific overlap, instead of guessing.
 */
export const runGuarded = (
  logFile: string,
  run: () => Promise<unknown>,
): (() => Promise<void>) => {
  const jobName = jobNameFromLogFile(logFile);
  let running = false;
  return async () => {
    if (running) return;

    const before = snapshotMemoryMb();
    if (isMemoryUnderPressure(before)) {
      await appendLog("memory-monitor.log", {
        event: "skipped_memory_pressure",
        job: jobName,
        activeJobs: [...activeJobNames],
        memoryMb: before,
        reason: `Memory pressure trip-wire: rss=${before.rss}MB (limit ${CRON_MEMORY_CEILING_RSS_MB}MB), heapUsed=${before.heapUsed}MB (limit ${CRON_MEMORY_CEILING_HEAP_USED_MB}MB)`,
      });
      return;
    }

    running = true;
    activeJobNames.add(jobName);
    const startedAt = Date.now();
    await appendLog("memory-monitor.log", {
      event: "start",
      job: jobName,
      activeJobs: [...activeJobNames],
      memoryMb: before,
    });
    try {
      const summary = await run();
      await appendLog(logFile, { ok: true, summary });
    } catch (error) {
      await appendLog(logFile, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      const after = snapshotMemoryMb();
      activeJobNames.delete(jobName);
      await appendLog("memory-monitor.log", {
        event: "end",
        job: jobName,
        durationMs: Date.now() - startedAt,
        activeJobs: [...activeJobNames],
        memoryMb: after,
        memoryDeltaMb: {
          rss: Math.round((after.rss - before.rss) * 10) / 10,
          heapUsed: Math.round((after.heapUsed - before.heapUsed) * 10) / 10,
        },
      });
      running = false;
    }
  };
};

/**
 * Registers the in-process sync jobs. The first four used to be driven by
 * system crontab entries hitting Next.js API routes over an HTTP loopback
 * call (see docs/archive/specs/in-app-cron-scheduler.md); the social-post draft
 * queue job is new (docs/archive/specs/social-icons-and-post-drafts.md) but follows
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
  // global_earthquakes retention cleanup (issue #582) — this table had no
  // retention limit at all; USGS's all_hour feed alone writes rows forever
  // even though every reader caps its lookback at 168 hours. Daily at
  // 4:36am: hour 4 sits in this file's existing off-peak block alongside
  // green-products (30), cool-spots (33), wra-catalog (30),
  // carbon-footprint-products (45), carbon-footprint-coefficients (50),
  // cleaning-squads (53), green-restaurants (58) — minute 36 isn't one of
  // those. It also isn't on any hourly-grid job's minute, so it won't
  // collide at 4am the way an hourly job's minute would: rss 5/35, aqi
  // 20/50, cwa 15/45, earthquakes-sync 3/13/23/33/43/53,
  // news-card-images+power-sync 0/10/20/30/40/50, water-outages 25,
  // wra-water-outages 18/48, aqx-sync 10/40, wra-sync 8/38, wra-iot
  // 12/27/42/57, youbike every-5, metro-alerts 0/30, emergency-rooms
  // 7/22/37/52, transit-accessibility-alerts 16/46, senior-tourism-alerts
  // 17/47.
  cron.schedule(
    "36 4 * * *",
    runGuarded("earthquakes-retention-cleanup-cron.log", () => runEarthquakeRetentionCleanup()),
  );
  // Once daily — no specific business requirement on exact hour, 8am
  // server-local keeps it clear of the denser :00-ish traffic from the jobs
  // above. See docs/archive/specs/social-icons-and-post-drafts.md section 2.3.
  cron.schedule(
    "0 8 * * *",
    runGuarded("social-post-queue-cron.log", () => buildDailyDraftQueue()),
  );
  // The WRA drought source was removed on 2026-08-31 — see
  // docs/archive/specs/drop-wra-drought-source.md. It used to be excluded from this
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
  // docs/archive/specs/news-card-image-freshness-scheduling.md) so Pixabay
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
      const seinsights = await runSeinsightsEventsSync();
      const g0v = await runG0vEventsSync();
      const presidential = await runPresidentialVisitSync();
      const kuma = await runKumaEventsSync();
      return { shows, npo, seinsights, g0v, presidential, kuma };
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
  // WRA water outages sync (wra_water_outages, the table /tools/water-outages
  // actually reads) — issue #337 /
  // docs/archive/specs/water-outages-live-ingestion-gap.md: this table had NO
  // ingestion anywhere in the repo, so the page always fell back to
  // WATER_OUTAGES_SEED. Every hour, offset from the legacy water-outages-cron
  // job's :25 (see above) at :18/:48 — not on any other hourly job's exact
  // minute in this file (rss 5/35, aqi 20/50, cwa 15/45, earthquakes
  // 3/13/23/33/43/53, news-card-images+power-realtime
  // 0/10/20/30/40/50, aqx 10/40, wra-sync 8/38, wra-iot 12/27/42/57, metro
  // 0/30, emergency-rooms 7/22/37/52) other than youbike's unavoidable
  // every-5-minute grid. Coordinate further with the
  // github-actions-cron-decollision ticket if that lands first.
  cron.schedule(
    "18,48 * * * *",
    runGuarded("wra-water-outages-cron.log", () => runWraWaterOutagesSync()),
  );
  // 水質分頁 (issue #673 / Track B B-13) — 台水 36605 鄉鎮總硬度，目錄標示每 3
  // 個月更新，所以每月 2 日 05:29 跑一次即可（日後 B-14 的淨水場檢驗結果也掛
  // 在同一個 job 裡，見 lib/server/waterQuality/runSync.ts）。29 分不在任何
  // 其他 job 的分鐘格線上，也不是 youbike 每 5 分鐘格線的倍數；5 點區段已用的
  // 分鐘是 5、12(僅每月 1 日)、15(僅週六)、18(僅每月 1 日)、22、30，加上每小時
  // job 的分鐘——29 與它們都不會在同一個 tick 碰撞（由 waterQuality 的
  // dbConventions.test.mjs 逐一解析所有 cron 運算式驗證）。這個 job 自己再用
  // withAdvisoryLock 防重疊。
  cron.schedule(
    "29 5 2 * *",
    runGuarded("water-quality-sync-cron.log", () => runWaterQualitySync()),
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
  // WRA 水資源物聯網 (iot.wra.gov.tw) 堤防結構安全監測 + 地下水位監測 (issue
  // #270) — real per-minute IoT telemetry (each measurement carries its own
  // TimeStamp), so this runs more often than the 30-minute wra-sync above:
  // every 15 minutes. Minutes 12/27/42/57 are picked to sit clear of every
  // other job's grid in this file — not on :00/:15/:30/:45, not on
  // wra-sync's 8/38, not on aqx-sync's 10/40 or earthquake-sync's
  // 3/13/23/33/43/53, and not a multiple of 5 (youbike-sync's every-5-minute
  // grid) — so this doesn't stack onto an already-busy tick.
  cron.schedule(
    "12,27,42,57 * * * *",
    runGuarded("wra-iot-sync-cron.log", () => runWraIotSync()),
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
  // 垃圾車路線與清運點 (issue #674 / B-16) — 臺北市 136515＋新北市 125664，來源
  // 每日整批更新，daily 即可；03:41 的分鐘 41 不在本檔案任何其他 job 的分鐘格線上
  // （3 點區段已用 0、15、20、25、30，另有每小時型 job 的 3/13/23/33/43/53 等，
  // 皆不含 41；spec §4.3 的提議分鐘）。兩城市各自失敗隔離、先 upsert 再依 50% 防呆
  // 對帳，自己再用 withAdvisoryLock 防重疊，見 lib/server/garbageRoutes/runSync.ts。
  cron.schedule(
    "41 3 * * *",
    runGuarded("garbage-routes-sync-cron.log", () => runGarbageRoutesSync()),
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
  // YouBike 2.0 every 5 minutes — batch upserts real-time station availability across Taipei, NTPC, Hsinchu
  cron.schedule(
    "*/5 * * * *",
    runGuarded("youbike-sync-cron.log", () => runYouBikeSync()),
  );
  // Rail alerts every 30 minutes (issue #470) — fans out across all 6 TDX metro/light-rail
  // systems + TRA + THSR (Promise.allSettled-isolated per system), falling back to Taipei
  // Metro's own Big5 CSV for TRTC only when TDX's TRTC call itself fails
  cron.schedule(
    "0,30 * * * *",
    runGuarded("metro-alerts-sync-cron.log", () => runMetroAlertsSync()),
  );
  // 林火風險 (農業部 ForestFireAlertWCF, B-12 / issue #672) — 來源每日一批（每個
  // 測站/森林遊樂區一列、帶 CreateDate），一天兩次（06:09、12:09）足以在早上與中午
  // 各補一次當日資料。分鐘 9 不在任何既有 job 的格線上：不是 youbike 每 5 分鐘格線
  // (0/5/10/.../55)，也不是 rss 5/35、aqi 20/50、cwa 15/45、earthquakes
  // 3/13/23/33/43/53、aqx 10/40、wra-sync 8/38、wra-iot 12/27/42/57、metro 0/30、
  // emergency-rooms 7/22/37/52 等每小時 job 的分鐘，也不是 culture-shows 的 10、
  // pest-alerts 的 12、who-don 的 19，所以 6 點與 12 點都不會跟任何 job 同 tick
  // （lib/server/forestFire/dbConventions.test.mjs 會檢查這點）。這個 job 自己再用
  // withAdvisoryLock 防重疊，見 lib/server/forestFire/runSync.ts。
  cron.schedule(
    "9 6,12 * * *",
    runGuarded("forest-fire-sync-cron.log", () => runForestFireSync()),
  );
  // MOA Crop Pest warnings every 6 hours — near-realtime survey bulletins and critical alerts
  cron.schedule(
    "12 0,6,12,18 * * *",
    runGuarded("pest-alerts-sync-cron.log", () => runPestAlertsSync()),
  );
  // Latest books recommendation daily at 05:30am off-peak — syncs Top 20 across 41 categories and purges old entries
  cron.schedule(
    "30 5 * * *",
    runGuarded("latest-books-sync-cron.log", () => runLatestBooksSync()),
  );
  // 食藥署藥品短缺 54504/54505 (issue #670) — 目錄標示每 7 日更新，weekly 即可；
  // 週一 02:32。分鐘 32 不在任何「每小時」job 的格線上 (rss 5/35、aqi 20/50、
  // cwa 15/45、earthquakes 3/13/23/33/43/53、aqx 10/40、wra-sync 8/38、
  // water-outages 25、wra-water-outages 18/48、emergency-rooms 7/22/37/52、
  // transit-accessibility-alerts 16/46、senior-tourism-alerts 17/47、gdacs
  // 14/44、wra-iot 12/27/42/57、metro-alerts 0/30、news-card-images+power
  // 0/10/20/30/40/50、youbike 每 5 分鐘)，2 點區段目前只有 cdc-alerts 的 15
  // 分。刻意不用 spec 提議的 34 分，避免與同期其他 FDA 週更 ticket 撞同一個
  // tick。這個 job 自己再用 withAdvisoryLock 防重疊，見
  // lib/server/drugs/runShortagesSync.ts。
  cron.schedule(
    "32 2 * * 1",
    runGuarded("drug-shortages-sync-cron.log", () => runDrugShortagesSync()),
  );
  // 全台電力概況儀表板 (issue #177) — 台電 d006001 各機組即時發電量 + d525001
  // 核電廠周邊輻射偵測站都約每 10 分鐘更新一次，比照 wra-sync 的 30 分鐘級距
  // 慣例但取一半頻率貼近來源更新節奏。
  cron.schedule(
    "*/10 * * * *",
    runGuarded("power-sync-cron.log", () => runPowerRealtimeSync()),
  );
  // 經濟部能源署 set_id=55 全國發電來源配比 — 極小型靜態總表，幾乎不變，daily
  // off-peak 即可，取一個未被佔用的凌晨分鐘。
  cron.schedule(
    "5 5 * * *",
    runGuarded("power-mix-sync-cron.log", () => runPowerMixSync()),
  );
  // 全國急救責任醫院急診即時訊息每 15 分鐘同步一次 (issue #280)
  cron.schedule(
    "7,22,37,52 * * * *",
    runGuarded("emergency-rooms-sync-cron.log", () => runEmergencyRoomSync()),
  );
  // TDX Senior/Rail 無障礙設施/服務/導覽圖/跨運具轉乘 (issue #434) — 來源
  // UpdateInterval 多為 86400 (每日)，排在 3am off-peak 區段但避開 public-art
  // 的 "0 3"。
  cron.schedule(
    "15 3 * * *",
    runGuarded("transit-accessibility-sync-cron.log", () => runTransitAccessibilitySync()),
  );
  // TDX Senior/Rail 設施停用公告 (issue #434) — 來源 UpdateInterval 為 -1
  // (事件觸發)，需要比上面每日同步更高的更新頻率；16/46 這兩個分鐘在本檔案中
  // 目前未被任何其他 job 佔用。
  cron.schedule(
    "16,46 * * * *",
    runGuarded("transit-accessibility-alerts-cron.log", () => runTransitFacilityAlertsSync()),
  );
  // TDX Senior/Tourism 景區無障礙設施/服務/樂齡套票 (issue #436) — 來源
  // UpdateInterval 多為 86400 (每日)，排在 3am off-peak 區段，避開 public-art 的
  // "0 3" 與 transit-accessibility 的 "15 3"。
  cron.schedule(
    "20 3 * * *",
    runGuarded("senior-tourism-sync-cron.log", () => runSeniorTourismSync()),
  );
  // TDX Senior/Tourism 景區設施停用公告 (issue #436) — 來源 UpdateInterval 為
  // -1 (事件觸發)，需要比上面每日同步更高的更新頻率；17/47 這兩個分鐘在本檔案中
  // 目前未被任何其他 job 佔用 (不與 transit-accessibility-alerts 的 16/46 衝突)。
  cron.schedule(
    "17,47 * * * *",
    runGuarded("senior-tourism-alerts-cron.log", () => runSeniorTourismAlertsSync()),
  );
  // TDX Senior/SeniorCard 22縣市敬老卡交通補助 (issue #436) — 補助政策不會頻繁
  // 變動，daily 即可；排在 3am 區段的 25 分，避開上面兩個新 job 用到的 20 分。
  cron.schedule(
    "25 3 * * *",
    runGuarded("senior-card-sync-cron.log", () => runSeniorCardSync()),
  );
  // TDX Basic Bus Vehicle/Schedule 低地板公車比率 (issue #467) — 取代
  // accessible_transit_routes 原本寫死的種子值。來源為即時車輛/班次資料而非
  // UpdateInterval 固定值，daily 已足夠反映車隊配置的實際變動；排在 3am
  // 區段的 30 分，避開上面三個 transit/senior job 用到的 15/20/25 分。
  cron.schedule(
    "30 3 * * *",
    runGuarded("transit-bus-sync-cron.log", () => runTransitBusSync()),
  );
  // 警政署 176455「遭停止解析涉詐網站」(issue #564) — 來源約每月發佈一批新
  // 名單，monthly 即可；第 1 天 05:12 是 off-peak 時段裡本檔案目前完全沒有
  // day-of-month 限制、也沒被 5 點區段其他 job（power-mix 的 5 5、latest-books
  // 的 30 5）佔用的分鐘。這個 job 自己再用 withAdvisoryLock 防重疊，見
  // lib/server/antiFraud/runSync.ts。
  cron.schedule(
    "12 5 1 * *",
    runGuarded("fraud-domains-sync-cron.log", () => runFraudDomainsSync()),
  );
  // 數產署 165027「詐騙網域停止解析清單」(issue #567) — 近乎每日更新，填補
  // 176455 每月批次之間的空窗期；5am 區段的 22 分未被本檔案任何其他 job
  // 佔用（5am 已用：5 的 power-mix、12 的 fraud-domains-sync(僅每月 1 號)、
  // 30 的 latest-books-sync）。這個 job 自己再用 withAdvisoryLock
  // (moda_165027_sync_lock，與 176455 的 fraud_domains_sync_lock 不同) 防
  // 重疊，見 lib/server/antiFraud/runSync.ts。160055（已停更的歷史資料）
  // 刻意不排程——只在部署後手動跑一次 scripts/import-police-160055.mjs。
  cron.schedule(
    "22 5 * * *",
    runGuarded("moda-165027-sync-cron.log", () => runModa165027Sync()),
  );
  // 警政署 172159「打詐儀錶板打擊詐欺成效」(issue #570) — 來源每月發佈一列全
  // 國彙總統計，monthly 即可；第 1 天 05:18——rebase 合併時發現原本選的 22 分
  // 會跟上面 moda-165027-sync 的「每日 22 分」在每月 1 號當天同一分鐘撞在一
  // 起（moda 是 daily，這個是 monthly on day 1，兩者在 1 號那天是同一個
  // tick），改成 18 分避開；18 分目前本檔案沒有其他 job 使用。這個 job 自己再
  // 用 withAdvisoryLock 防重疊，見 lib/server/antiFraud/runTrendSync.ts。
  cron.schedule(
    "18 5 1 * *",
    runGuarded("police-172159-stats-sync-cron.log", () => runPoliceFraudInterdictionStatsSync()),
  );
  // 金管會 11198「打詐儀表板」違規投資廣告 (issue #570) — 來源每週發佈一列
  // (確認過往紀錄固定在週五)，所以排在每週六 05:15，給來源一天緩衝；05 點區段
  // 目前沒有其他 job 用到週六限定、分鐘 15 的組合（daily 5 點 job 只用了
  // 5/22/30 這三個分鐘，與這個每週六才跑一次的 job 不會真的撞在同一個 tick
  // 上）。這個 job 自己再用 withAdvisoryLock 防重疊，見
  // lib/server/antiFraud/runTrendSync.ts。
  cron.schedule(
    "15 5 * * 6",
    runGuarded("fsc-11198-stats-sync-cron.log", () => runFscFraudAdStatsSync()),
  );
  // GDACS 全球災害事件 (issue #592 / #583) — 每 30 分鐘一次，供「颱風」「全球
  // 災害」項目與「地震」警戒色疊加共用。14/44 這兩個分鐘在本檔案目前完全沒被
  // 任何其他 job 佔用：不在 rss 的 5/35、aqi 的 20/50、cwa 的 15/45、earthquakes
  // 的 3/13/23/33/43/53、news-card-images+power-realtime 的
  // 0/10/20/30/40/50、water-outages 的 25、wra-water-outages 的 18/48、aqx 的
  // 10/40、wra-sync 的 8/38、wra-iot 的 12/27/42/57、metro-alerts 的
  // 0/30、emergency-rooms 的 7/22/37/52、transit-accessibility-alerts 的
  // 16/46、senior-tourism-alerts 的 17/47，也不是 youbike 的每 5 分鐘格線
  // (0/5/10/.../55) 上。這個 job 自己再用 withAdvisoryLock 防重疊，見
  // lib/server/gdacs/runSync.ts。
  cron.schedule(
    "14,44 * * * *",
    runGuarded("gdacs-sync-cron.log", () => runGdacsSync()),
  );
  // GDACS 事件保留期清除 (issue #592) — 已結束 (end_time 非 null) 超過 30 天的
  // 事件每日清除一次。4 點區段裡 40 分未被 green-products/wra-catalog 的
  // 30、carbon-footprint-products 的 45、carbon-footprint-coefficients 的
  // 50、cool-spots 的 33、iaq-premises 的 38、cleaning-squads 的 53、
  // green-restaurants 的 58 佔用。
  cron.schedule(
    "40 4 * * *",
    runGuarded("gdacs-cleanup-cron.log", () => runGdacsCleanup()),
  );
  // WHO Disease Outbreak News (issue #596 / #583) — 每 6 小時一次，供「國際疫
  // 情」項目後續的 WHO 圖釘疊加使用。沿用 culture-shows (10 0,6,12,18) /
  // pest-alerts (12 0,6,12,18) 的每 6 小時慣例，但取未被佔用的 19 分：不是
  // youbike 每 5 分鐘格線 (0/5/10/.../55) 上的分鐘，也不在本檔案任何其他
  // 「每小時」job 的分鐘上 (rss 5/35、aqi 20/50、cwa 15/45、earthquakes
  // 3/13/23/33/43/53、news-card-images+power-realtime 0/10/20/30/40/50、
  // water-outages 25、wra-water-outages 18/48、aqx 10/40、wra-sync 8/38、
  // wra-iot 12/27/42/57、metro-alerts 0/30、emergency-rooms 7/22/37/52、
  // transit-accessibility-alerts 16/46、senior-tourism-alerts 17/47、gdacs-sync
  // 14/44)，也不是 culture-shows 的 10 分或 pest-alerts 的 12 分，所以在
  // 0/6/12/18 這四個整點都不會撞到任何既有 job。這個 job 自己再用
  // withAdvisoryLock 防重疊，見 lib/server/who/runSync.ts。
  cron.schedule(
    "19 0,6,12,18 * * *",
    runGuarded("who-don-sync-cron.log", () => runWhoDonSync()),
  );
  // WHO DON 保留期清除 (issue #596) — 超過 180 天的資料每日清除一次。4 點區
  // 段裡 24 分未被 earthquakes-retention-cleanup 的 36、green-products/
  // wra-catalog 的 30、carbon-footprint-products 的 45、carbon-footprint-
  // coefficients 的 50、cool-spots 的 33、iaq-premises 的 38、cleaning-squads
  // 的 53、green-restaurants 的 58、gdacs-cleanup 的 40 佔用，也不在任何
  // 「每小時」job 的分鐘格線上（見上面 who-don-sync 註解列出的清單）。
  cron.schedule(
    "24 4 * * *",
    runGuarded("who-don-cleanup-cron.log", () => runWhoDonCleanup()),
  );
};
