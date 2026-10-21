import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractCronSchedules } from "../lib/server/cron/cronCollisions.mjs";

// issue #729：樂齡旅遊（景區無障礙設施／服務／套票／每小時停用公告）整個移除，
// 敬老卡補助保留為靜態資料（頁面網址 /tools/senior-friendly 不變，改名「敬老卡補助」）。這個檔案守住：
//   1. 樂齡旅遊的程式碼、元件、API 欄位、排程都沒有殘留。
//   2. 四張樂齡旅遊表由 ensureSchema 冪等 DROP，且沒有任何地方還會把它們建回。
//   3. 敬老卡補助（表、種子、手動同步、頁面、API）還在，且沒有任何排程。
//   4. 不誤傷：無障礙交通頁自己的電梯停用公告排程與資料表、TDX 共用基礎設施與軌道無障礙 client 都還在。
// 頁面網址不變，所以沒有 301。

const REPO_ROOT_PATH = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT_PATH, ...parts), "utf8");
// 目錄本身不算「還在」：git 刪完檔案後本機可能留下空資料夾；只要底下沒有任何檔案就視為已移除。
const hasAnyFile = (...parts) => {
  const full = path.join(REPO_ROOT_PATH, ...parts);
  if (!fs.existsSync(full)) return false;
  if (!fs.statSync(full).isDirectory()) return true;
  return fs.readdirSync(full, { withFileTypes: true }).some((e) => (e.isDirectory() ? hasAnyFile(...parts, e.name) : true));
};

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

const TOURISM_TABLES = [
  "senior_tourism_facilities",
  "senior_tourism_services",
  "senior_tour_packages",
  "senior_tourism_alerts",
];

test("senior tourism code, admin route and TDX tourism client are all gone (the card code moved to lib/server/seniorCard)", () => {
  assert.ok(!hasAnyFile("lib", "server", "seniorTourism"), "lib/server/seniorTourism should have been removed");
  assert.ok(!hasAnyFile("app", "api", "admin", "senior-tourism-sync"), "the tourism admin sync route should have been removed");
  for (const kept of [
    ["lib", "server", "seniorCard", "queries.ts"],
    ["lib", "server", "seniorCard", "types.ts"],
    ["lib", "server", "seniorCard", "runSync.ts"],
    ["lib", "server", "seniorCard", "tdxClient.ts"],
    ["lib", "server", "seniorCard", "data", "seniorCardSeed.ts"],
    ["app", "api", "admin", "senior-card-sync", "route.ts"],
  ]) {
    assert.ok(hasAnyFile(...kept), `${kept.join("/")} should exist`);
  }
  const client = stripComments(read("lib", "server", "seniorCard", "tdxClient.ts"));
  assert.doesNotMatch(client, /Tourism|\/Facility|SeniorTourPackage/, "the card client must not call any Tourism endpoint");
});

test("ensureSchema DROPs the four senior tourism tables idempotently and keeps senior_card_subsidies", () => {
  const mysql = stripComments(read("lib", "server", "db", "mysql.ts"));
  assert.match(
    mysql,
    /RETIRED_SENIOR_TOURISM_TABLES\s*=\s*\[\s*"senior_tourism_facilities",\s*"senior_tourism_services",\s*"senior_tour_packages",\s*"senior_tourism_alerts",?\s*\]/,
  );
  assert.match(mysql, /DROP TABLE IF EXISTS/, "must be the idempotent form");
  assert.doesNotMatch(mysql, /DROP TABLE(?! IF EXISTS)/, "a bare DROP TABLE would fail on every run after the first");

  // DROP 必須在 runSchemaMigrations（ensureSchema 執行的那段）裡，且失敗不能拖垮整個 schema 初始化。
  const start = mysql.indexOf("const runSchemaMigrations");
  const loopAt = mysql.indexOf("for (const legacyTable of RETIRED_SENIOR_TOURISM_TABLES)", start);
  assert.ok(start >= 0 && loopAt > start, "the DROP loop lives inside runSchemaMigrations");
  const loopBlock = mysql.slice(loopAt, loopAt + 450);
  assert.match(loopBlock, /try\s*\{/);
  assert.match(loopBlock, /DROP TABLE IF EXISTS/);
  assert.match(loopBlock, /catch\s*\(/);

  // 敬老卡補助表保留：仍有建表敘述、仍被建立、絕不被 DROP。
  assert.match(mysql, /TABLE_DDL\.seniorCardSubsidies/);
  assert.doesNotMatch(mysql, /RETIRED_SENIOR_TOURISM_TABLES[^\]]*senior_card_subsidies/);
  assert.match(stripComments(read("lib", "server", "db", "schema.ts")), /CREATE TABLE IF NOT EXISTS senior_card_subsidies/);

  // runtime 程式碼任何地方都不能再 CREATE／ALTER／INSERT／SELECT 這些表，也不能再 import 舊目錄
  // （順序反了會在下次啟動悄悄建出空表）。掃描整個 repo（略過 node_modules、.git、docs、.claude 與本機建置輸出 .next*）。
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "docs", ".claude"].includes(entry.name) || entry.name.startsWith(".next")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(entry.name)) {
        const rel = path.relative(REPO_ROOT_PATH, full).replace(/\\/g, "/");
        if (rel === "tests/senior-tourism-removal-729.test.mjs") continue;
        const code = stripComments(fs.readFileSync(full, "utf8"));
        if (/senior_tourism|senior_tour_packages|seniorTourism|senior-tourism/i.test(code)) offenders.push(rel);
      }
    }
  };
  walk(REPO_ROOT_PATH);
  // mysql.ts 是唯一允許寫出表名的檔案（只為了 DROP 它們）。
  assert.deepEqual(offenders, ["lib/server/db/mysql.ts"]);
  for (const table of TOURISM_TABLES) assert.ok(mysql.includes(table), `${table} must be listed for DROP`);
});

test("registerJobs.ts schedules no senior tourism or senior card job, but the elevator-outage job of the accessible-transit page is untouched", () => {
  const source = read("lib", "server", "cron", "registerJobs.ts");
  const jobs = extractCronSchedules(source);
  assert.ok(!jobs.some((job) => /senior/i.test(job.name)), "no senior-tourism-*/senior-card-* cron job");
  assert.doesNotMatch(stripComments(source), /runSeniorTourism|runSeniorCardSync|seniorCard|seniorTourism/);
  // 不誤傷：無障礙交通頁的電梯停用公告（另一個資料來源與資料表）。
  const elevator = jobs.find((job) => job.name === "transit-accessibility-alerts-cron.log");
  assert.ok(elevator, "transit-accessibility-alerts must still be scheduled");
  assert.equal(elevator.expression, "16 * * * *");
  // 每日軌道無障礙同步已在 issue #730 移除（見 tests/accessible-transit-slimdown-730.test.mjs）。
  assert.ok(fs.existsSync(path.join(REPO_ROOT_PATH, "lib", "server", "transit", "tdxSeniorClient.ts")), "rail accessibility TDX client (elevator-outage alerts) stays");
  assert.match(stripComments(read("lib", "server", "db", "schema.ts")), /CREATE TABLE IF NOT EXISTS accessible_transit_facility_alerts/);
  // 不寫死總數：後續移除功能的票也會減少排程，精確數字以 docs/domains/10-scheduling-sync-ci.md 為準。
  assert.ok(jobs.length >= 30, `expected the reader to still find the other jobs, found ${jobs.length}`);
});

test("TDX token, rate limiter and circuit breaker are kept for the remaining callers", () => {
  for (const file of ["auth.ts", "rateLimiter.ts", "circuitBreaker.ts", "getJsonWithRetry.ts", "seniors.ts"]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT_PATH, "lib", "server", "tdx", file)), `lib/server/tdx/${file}`);
  }
});

test("GET /api/senior-friendly keeps the card shape and drops the four tourism fields", () => {
  const route = stripComments(read("app", "api", "senior-friendly", "route.ts"));
  assert.match(route, /getSeniorCardOverview/);
  assert.doesNotMatch(route, /tourism|tourPackages/i);
  const types = read("lib", "server", "seniorCard", "types.ts");
  assert.match(types, /interface SeniorCardOverview\s*\{\s*seniorCards: SeniorCardEntry\[\];\s*counties: string\[\];\s*\}/);
  // 敬老卡每一列的形狀不變（前端與外部消費者依賴）。
  assert.match(types, /interface SeniorCardEntry\s*\{\s*county: string;\s*cardName: string \| null;\s*infoUrl: string \| null;\s*subsidies: SeniorCardSubsidyItem\[\];\s*\}/);
  assert.match(types, /interface SeniorCardSubsidyItem\s*\{\s*category: string \| null;\s*description: string \| null;\s*\}/);
});

test("catalog, nav, locales and the page no longer mention senior tourism, and the tool is renamed 敬老卡補助 with the URL unchanged", () => {
  const catalog = read("lib", "server", "tools", "catalog.ts");
  const entryStart = catalog.indexOf('slug: "senior-friendly"');
  assert.ok(entryStart >= 0, "the senior-friendly catalog entry (and so the URL) stays");
  const entry = catalog.slice(entryStart, catalog.indexOf('slug: "social-welfare-centers"', entryStart));
  assert.doesNotMatch(entry, /樂齡旅遊|樂齡套票|景區|無障礙設施|停用公告|輪椅|TDX/, "catalog entry text");
  assert.match(entry, /navLabel:\s*"敬老卡補助"/);

  assert.doesNotMatch(read("lib", "server", "tools", "navModel.ts"), /樂齡旅遊|樂齡套票/);
  assert.doesNotMatch(read("README.md"), /樂齡旅遊|樂齡套票/);
  assert.doesNotMatch(read("app", "(zh)", "tools", "senior-friendly", "page.tsx"), /樂齡|景區|輪椅|語音導覽/);
  for (const locale of ["en", "ja", "ko"]) {
    const json = read("locales", `${locale}.json`);
    const parsed = JSON.parse(json);
    const found = JSON.stringify(parsed).includes('"senior-friendly"');
    assert.ok(found, `${locale}.json keeps a senior-friendly title`);
    assert.doesNotMatch(json, /Age-Friendly Travel|シニア旅行|시니어 여행/, `${locale}.json`);
  }
});
