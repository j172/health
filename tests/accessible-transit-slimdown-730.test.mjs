import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractCronSchedules } from "../lib/server/cron/cronCollisions.mjs";

// issue #730：無障礙交通瘦身（部分瘦身，頁面保留）。這個檔案守住：
//   1. 兩個每日 TDX 排程（每日軌道無障礙同步、每日公車低地板比率同步）已移除，只留每小時電梯停用公告。
//   2. 只被那兩個同步使用的程式碼（railSyncCore／railSyncStore／busLowFloorMath／TDX 公車客戶端／
//      Facility、Service、Map、Transfer 抓取）已刪，但電梯公告客戶端、共用 TDX 基礎設施與
//      手動 facilities-sync 用到的縣市清單（#731 起為 lib/server/tdx/cities.ts 的 TDX_CITIES）都還在。
//   3. 頁面不再有空的「站內導覽圖」「周邊轉乘」區塊；公車低地板區塊標註「種子資料、非即時」（含 en／ja／ko）。
//   4. /api/accessible-transit 的讀取行為不變（DB 優先、空表才灌種子），只移除恆為空的 stationMaps／transfers 欄位。
//   5. accessible_transit_station_maps、accessible_transit_transfers 由 ensureSchema 冪等 DROP 且不會被建回；
//      其餘 accessible_transit_* 表仍會被建立、不被 DROP。

const REPO_ROOT_PATH = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT_PATH, ...parts), "utf8");
// 目錄本身不算「還在」：git 刪完檔案後本機可能留下空資料夾；檔案本身存在才算。
const exists = (...parts) => fs.existsSync(path.join(REPO_ROOT_PATH, ...parts));

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

const RETIRED_TABLES = ["accessible_transit_station_maps", "accessible_transit_transfers"];
const KEPT_TABLES = [
  ["accessible_transit_routes", "accessibleTransitRoutes"],
  ["accessible_transit_facilities", "accessibleTransitFacilities"],
  ["accessible_transit_facility_alerts", "accessibleTransitFacilityAlerts"],
  ["accessible_transit_sync_state", "accessibleTransitSyncState"],
];

test("registerJobs.ts: the daily rail-accessibility and daily bus low-floor jobs are gone, the hourly elevator-outage job stays", () => {
  const source = read("lib", "server", "cron", "registerJobs.ts");
  const jobs = extractCronSchedules(source);
  assert.ok(!jobs.some((job) => job.name === "transit-accessibility-sync-cron.log"), "no daily rail accessibility sync");
  assert.ok(!jobs.some((job) => job.name === "transit-bus-sync-cron.log"), "no daily bus low-floor sync");
  assert.ok(!jobs.some((job) => job.expression === "15 3 * * *" || job.expression === "30 3 * * *"), "the two old 3am slots are free");
  assert.doesNotMatch(stripComments(source), /runTransitAccessibilitySync|runTransitBusSync/);

  const elevator = jobs.find((job) => job.name === "transit-accessibility-alerts-cron.log");
  assert.ok(elevator, "the hourly elevator-outage job must still be scheduled");
  assert.equal(elevator.expression, "16 * * * *");
  assert.match(stripComments(source), /runTransitFacilityAlertsSync\(\)/);
  // 無障礙交通頁只剩這一個 transit-* 排程。不寫死總數，精確數字以 docs/domains/10-scheduling-sync-ci.md 為準。
  assert.deepEqual(jobs.filter((job) => /^transit-/.test(job.name)).map((job) => job.name), ["transit-accessibility-alerts-cron.log"]);
  assert.ok(jobs.length >= 30, `expected the reader to still find the other jobs, found ${jobs.length}`);
});

test("code used only by the two daily syncs is deleted; the elevator-outage client and shared TDX infrastructure stay", () => {
  for (const gone of [
    ["lib", "server", "transit", "railSyncCore.ts"],
    ["lib", "server", "transit", "railSyncStore.ts"],
    ["lib", "server", "transit", "busLowFloorMath.ts"],
    ["app", "api", "admin", "transit-bus-sync", "route.ts"],
  ]) {
    assert.ok(!exists(...gone), `${gone.join("/")} should have been removed`);
  }

  const runSync = stripComments(read("lib", "server", "transit", "runSync.ts"));
  assert.match(runSync, /export async function runTransitFacilityAlertsSync/);
  assert.doesNotMatch(runSync, /runTransitAccessibilitySync|runTransitBusSync|fetchAllTdxBusRoutes|runRailSystemsSync|withAdvisoryLock/);

  const senior = stripComments(read("lib", "server", "transit", "tdxSeniorClient.ts"));
  assert.match(senior, /export const fetchSeniorFacilityAlert/);
  assert.doesNotMatch(senior, /fetchSeniorFacility\s*=|fetchSeniorService|fetchSeniorMap|fetchSeniorTransfer|flattenFacilityCategories/);
  assert.doesNotMatch(senior, /"\/(Service|Map|Transfer)"/);

  // issue #731：railStationCounty.ts 改名 railSystems.ts（只剩 RAIL_SYSTEMS 代碼）。
  assert.ok(!exists("lib", "server", "transit", "railStationCounty.ts"), "old file name must be gone");
  const county = stripComments(read("lib", "server", "transit", "railSystems.ts"));
  assert.match(county, /export const RAIL_SYSTEMS/);
  assert.doesNotMatch(county, /fetchStationCountyMap|Rail\/TRA\/Station|Rail\/Metro\/Station|tdxGetJsonWithRetry/);

  // 縣市清單（手動 facilities-sync 的停車、有聲號誌來源共用）不再呼叫 TDX。
  // issue #731：tdxBusClient.ts 的 TDX_BUS_CITIES 改名 TDX_CITIES，搬到 lib/server/tdx/cities.ts。
  assert.ok(!exists("lib", "server", "transit", "tdxBusClient.ts"), "old file name must be gone");
  const cities = stripComments(read("lib", "server", "tdx", "cities.ts"));
  assert.match(cities, /export const TDX_CITIES/);
  assert.equal((cities.match(/^\s*[A-Z]{2,5}:\s*{\s*tdxName:/gm) || []).length, 22, "still exactly 22 counties");
  assert.doesNotMatch(cities, /Bus\/Vehicle|Bus\/Schedule|getTdxToken|tdxGetJsonWithRetry|fetchAllTdxBusRoutes|fetchCityBusRoutes/);
  for (const source of ["tdxParking.ts", "tdxAudibleSignals.ts"]) {
    assert.match(read("lib", "server", "facilities", "sources", source), /TDX_CITIES.*tdx\/cities/s, `${source} still uses the county list`);
  }

  // TDX token／限流器／斷路器與 admin 手動觸發電梯公告都保留。
  for (const file of ["auth.ts", "rateLimiter.ts", "circuitBreaker.ts", "getJsonWithRetry.ts", "seniors.ts"]) {
    assert.ok(exists("lib", "server", "tdx", file), `lib/server/tdx/${file}`);
  }
  const admin = read("app", "api", "admin", "transit-accessibility-sync", "route.ts");
  assert.match(admin, /requireAdminSecret/);
  assert.match(admin, /runTransitFacilityAlertsSync/);
  assert.doesNotMatch(stripComments(admin), /runTransitAccessibilitySync|searchParams/);
});

test("the page no longer renders the empty station-map / transfer blocks, and the bus block is labelled seed data, not real-time", () => {
  const raw = read("components", "Tools", "AccessibleTransitContent.tsx");
  const component = stripComments(raw);
  assert.doesNotMatch(component, /stationMap|StationMap|mapsByStation|transfersByStation|nearbyTransfers|transferFallback|appendOutboundUtm/);
  assert.doesNotMatch(component, /導覽圖|周邊轉乘/);
  // 不再用「即時同步」徽章誤導：來源徽章（tdx_bus／示範資料）整組移除，改為區塊層級的非即時標註。
  assert.doesNotMatch(component, /liveSyncBadge|demoDataBadge|r\.source === "tdx_bus"/);

  assert.match(component, /data-testid="bus-static-badge"/);
  assert.match(component, /accessibleTransitTool\.busStaticBadge/);
  assert.match(component, /data-testid="bus-static-note"/);
  assert.match(component, /accessibleTransitTool\.busStaticNote/);
  assert.match(component, /種子資料・非即時/);
  assert.match(component, /並非即時車輛資料/);
  // 其餘區塊還在：復康巴士專線、軌道／計程車設施、公車路線、停用公告、摘要卡。
  for (const marker of ["rehabBusHeading", "railMetroTaxiHeading", "busRoutesHeading", "alertsHeadingTemplate", "summaryMainRoutesLabel"]) {
    assert.ok(component.includes(`accessibleTransitTool.${marker}`), `${marker} block stays`);
  }
  // 公車標註放在公車區塊裡（badge 在公車標題之後、不在其他區塊）。
  assert.ok(raw.indexOf("busRoutesHeading") < raw.indexOf("bus-static-badge"));
  assert.ok(raw.indexOf("bus-static-note") < raw.indexOf("data?.routes.map"));
});

test("en / ja / ko carry the non-real-time wording and no longer carry the removed station-map / transfer / live-sync keys", () => {
  const removed = ["stationMapLabel", "nearbyTransfersLabel", "transferFallback", "liveSyncTitle", "liveSyncBadge", "demoDataTitle", "demoDataBadge"];
  const badgeWording = { en: /not real-time/i, ja: /リアルタイムではありません/, ko: /실시간 아님/ };
  const noteWording = { en: /not real-time/i, ja: /リアルタイムの車両情報ではありません/, ko: /실시간 차량 정보가 아닙니다/ };
  for (const locale of ["en", "ja", "ko"]) {
    const tool = JSON.parse(read("locales", `${locale}.json`)).accessibleTransitTool;
    assert.ok(tool, `${locale}.json keeps accessibleTransitTool`);
    for (const key of removed) assert.ok(!(key in tool), `${locale}.json must not keep ${key}`);
    assert.ok(tool.busStaticBadge && tool.busStaticNote, `${locale}.json has busStaticBadge / busStaticNote`);
    assert.match(tool.busStaticBadge, badgeWording[locale], `${locale} badge`);
    assert.match(tool.busStaticNote, noteWording[locale], `${locale} note`);
    // 沒有任何語系還宣稱公車比率是「即時」同步。
    assert.doesNotMatch(tool.countyCoverageBadge, /Real-time|リアルタイム|실시간/i, `${locale} coverage badge`);
  }
  const catalog = read("lib", "server", "tools", "catalog.ts");
  const entry = catalog.slice(catalog.indexOf('slug: "accessible-transit"'), catalog.indexOf('slug: "accessible-transit"') + 1200);
  assert.match(entry, /非即時/);
});

test("the page and its API stay: routes exist in zh and [locale], catalog entry is still there", () => {
  assert.ok(exists("app", "(zh)", "tools", "accessible-transit", "page.tsx"));
  assert.ok(exists("app", "[locale]", "tools", "accessible-transit", "page.tsx"));
  assert.ok(exists("app", "api", "accessible-transit", "route.ts"));
  assert.match(read("lib", "server", "tools", "catalog.ts"), /slug: "accessible-transit"/);
});

test("GET /api/accessible-transit keeps its read behaviour (DB first, seed only for an empty table) and only drops the always-empty fields", () => {
  const queries = stripComments(read("lib", "server", "transit", "queries.ts"));
  assert.doesNotMatch(queries, /stationMaps|accessible_transit_station_maps|accessible_transit_transfers|\btransfers\b/);
  // 仍讀 routes／facilities／facility_alerts，種子只在空表時灌入。
  assert.match(queries, /SELECT \* FROM accessible_transit_routes/);
  assert.match(queries, /SELECT \* FROM accessible_transit_facilities/);
  assert.match(queries, /accessible_transit_facility_alerts/);
  assert.match(queries, /SELECT COUNT\(\*\) as cnt FROM accessible_transit_routes[\s\S]{0,200}if \(\(routeCount\[0\]\?\.cnt \|\| 0\) === 0\)/);
  assert.match(queries, /SELECT COUNT\(\*\) as cnt FROM accessible_transit_facilities[\s\S]{0,200}if \(\(facCount\[0\]\?\.cnt \|\| 0\) === 0\)/);
  assert.match(queries, /TRANSIT_HOTLINES_SEED/);
  // 早期同步已寫入的列照舊讀出（凍結快照）。
  assert.match(queries, /sampleTrips: parseSampleTrips\(r\.sample_trips_json\)/);
  assert.match(queries, /source: \(r\.source as "seed" \| "tdx_bus"\) \|\| "seed"/);
  assert.match(queries, /source: \(f\.source as "seed" \| "tdx_senior"\) \|\| "seed"/);

  // 回傳形狀：其餘欄位不變。
  const returnAt = queries.indexOf("return {\n      routes,");
  assert.ok(returnAt > 0, "overview return block");
  const returnBlock = queries.slice(returnAt, returnAt + 400);
  for (const field of ["routes", "facilities", "hotlines", "alerts", "summary", "counties", "systemTypes"]) {
    assert.match(returnBlock, new RegExp(`\\b${field}\\b`), `${field} still returned`);
  }
  assert.doesNotMatch(returnBlock, /stationMaps|transfers/);

  const types = stripComments(read("lib", "server", "transit", "types.ts"));
  assert.doesNotMatch(types, /AccessibleTransitStationMap|AccessibleTransitTransfer|stationMaps|transfers/);
  const route = stripComments(read("app", "api", "accessible-transit", "route.ts"));
  assert.match(route, /getTransitAccessibilityOverview/);
  assert.match(route, /cacheInit\("medium"\)/);
});

test("ensureSchema DROPs the two empty tables idempotently, never recreates them, and keeps the other accessible_transit_* tables", () => {
  const mysql = stripComments(read("lib", "server", "db", "mysql.ts"));
  assert.match(
    mysql,
    /RETIRED_ACCESSIBLE_TRANSIT_TABLES\s*=\s*\[\s*"accessible_transit_station_maps",\s*"accessible_transit_transfers",?\s*\]/,
  );
  assert.match(mysql, /DROP TABLE IF EXISTS/, "must be the idempotent form");
  assert.doesNotMatch(mysql, /DROP TABLE(?! IF EXISTS)/, "a bare DROP TABLE would fail on every run after the first");

  // DROP 在 runSchemaMigrations 內（原建表位置：facility_alerts 之後、sync_state 之前），失敗不能拖垮整個 schema 初始化。
  const start = mysql.indexOf("const runSchemaMigrations");
  const loopAt = mysql.indexOf("for (const legacyTable of RETIRED_ACCESSIBLE_TRANSIT_TABLES)", start);
  assert.ok(start >= 0 && loopAt > start, "the DROP loop lives inside runSchemaMigrations");
  const alertsAt = mysql.indexOf("TABLE_DDL.accessibleTransitFacilityAlerts", start);
  const syncStateAt = mysql.indexOf("TABLE_DDL.accessibleTransitSyncState", start);
  assert.ok(alertsAt > 0 && alertsAt < loopAt && loopAt < syncStateAt, "DROP sits where the two CREATEs used to be");
  const loopBlock = mysql.slice(loopAt, loopAt + 450);
  assert.match(loopBlock, /try\s*\{/);
  assert.match(loopBlock, /DROP TABLE IF EXISTS/);
  assert.match(loopBlock, /catch\s*\(/);

  // 沒有任何建表敘述、ALTER、INSERT 或查詢還會碰這兩張表（掃整個 repo 的 runtime 程式碼；
  // 略過 node_modules、.git、docs、.claude 與本機建置輸出 .next*）。
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "docs", ".claude"].includes(entry.name) || entry.name.startsWith(".next")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(entry.name)) {
        const rel = path.relative(REPO_ROOT_PATH, full).replace(/\\/g, "/");
        if (rel === "tests/accessible-transit-slimdown-730.test.mjs") continue;
        const code = stripComments(fs.readFileSync(full, "utf8"));
        if (/accessible_transit_station_maps|accessible_transit_transfers|accessibleTransitStationMaps|accessibleTransitTransfers/.test(code)) offenders.push(rel);
      }
    }
  };
  walk(REPO_ROOT_PATH);
  // mysql.ts 是唯一允許寫出表名的檔案（只為了 DROP 它們）。
  assert.deepEqual(offenders, ["lib/server/db/mysql.ts"]);
  for (const table of RETIRED_TABLES) assert.ok(mysql.includes(table), `${table} must be listed for DROP`);

  // 其餘表仍有建表敘述、仍被建立、絕不在 DROP 清單。
  const schema = stripComments(read("lib", "server", "db", "schema.ts"));
  const dropList = mysql.slice(mysql.indexOf("RETIRED_ACCESSIBLE_TRANSIT_TABLES"), mysql.indexOf("] as const", mysql.indexOf("RETIRED_ACCESSIBLE_TRANSIT_TABLES")));
  for (const [table, ddlKey] of KEPT_TABLES) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`), `${table} keeps its CREATE`);
    assert.match(mysql, new RegExp(`TABLE_DDL\\.${ddlKey}\\b`), `${table} is still created`);
    assert.ok(!dropList.includes(table), `${table} must not be dropped`);
  }
  // 早期同步留下的欄位遷移也保留（凍結快照仍可讀）。
  assert.match(mysql, /ALTER TABLE accessible_transit_facilities/);
  assert.match(mysql, /ALTER TABLE accessible_transit_routes/);
});
