import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { extractCronSchedules, parseCronExpression } from "../lib/server/cron/cronCollisions.mjs";

// issue #731：移除 YouBike（#727）、全台軌道營運通阻（#728）、樂齡旅遊（#729）、無障礙交通 TDX 即時同步（#730）之後的
// 收尾清掃。這個檔案守住「整體一致」，且全部是結構檢查，不寫死排程總數或工具總數：
//   1. 全 repo 沒有指向已移除路徑的內部連結／slug（外部 301 規則與兩個 410 端點除外）。
//   2. 翻譯檔沒有被移除功能的殘留字句。
//   3. 排程數與 docs/domains/10-scheduling-sync-ci.md 一致；TDX 每日請求預算表與實際排程算出來的一樣。
//   4. TDX 剩餘呼叫端清單符合預期：電梯停用公告、手動／半年設施同步（停車、有聲號誌）、手動敬老卡同步。
//   5. 「llm-info」頁的工具數與分類數是從 catalog 算出來的，沒有寫死。
//   6. 改名後的舊檔名已消失（railStationCounty.ts、tdxBusClient.ts）。

const REPO_ROOT_PATH = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT_PATH, ...parts), "utf8");
const exists = (...parts) => fs.existsSync(path.join(REPO_ROOT_PATH, ...parts));
const toPosix = (p) => p.split(path.sep).join("/");

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".next3", "docs", "tests", "data", "images"]);

function listFiles(relativeDir, extensions, out = []) {
  const absoluteDir = path.join(REPO_ROOT_PATH, relativeDir);
  if (!fs.existsSync(absoluteDir)) return out;
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".next")) continue;
      listFiles(path.join(relativeDir, entry.name), extensions, out);
    } else if (extensions.some((ext) => entry.name.endsWith(ext)) && !/\.test\.mjs$/.test(entry.name)) {
      out.push(toPosix(path.join(relativeDir, entry.name)));
    }
  }
  return out;
}

const CODE_EXTENSIONS = [".ts", ".tsx", ".mjs", ".js"];
const DATA_EXTENSIONS = [".json", ".yml", ".yaml", ".sh", ".webmanifest", ".htaccess"];

// ---------------------------------------------------------------------------------------------
// 1. 沒有指向已移除路徑的內部連結
// ---------------------------------------------------------------------------------------------

// 這兩個檔案是「對外相容」的一部分：永久轉址規則與兩個只回 410 的舊 API 端點。
const REDIRECT_RULES_FILE = "lib/redirects/permanentRedirectRules.ts";
// 樂齡旅遊的 slug 用兩段字串拼出來：tests/senior-tourism-removal-729.test.mjs 會掃全 repo 的程式碼，
// 不允許任何其他檔案直接寫出舊 slug（它自己才被排除）。
const REMOVED_SLUGS = ["youbike", "metro-alerts", ["senior", "tourism"].join("-")];
const slugGroup = REMOVED_SLUGS.join("|");
const REMOVED_PATH_PATTERN = new RegExp(
  `/(?:[a-z]{2}/)?tools/(?:${slugGroup})\\b|/api/(?:${slugGroup})\\b|/api/admin/(?:${REMOVED_SLUGS[2]}-sync|transit-bus-sync)\\b`,
);
const REMOVED_SLUG_PATTERN = new RegExp(`["'\`](?:${slugGroup})["'\`]`);

const SCAN_ROOTS = ["app", "components", "lib", "scripts", "ops", ".github", "public", "locales", "types", "config", "agent"];

function scannedFiles() {
  const files = [];
  for (const dir of SCAN_ROOTS) {
    listFiles(dir, CODE_EXTENSIONS, files);
    listFiles(dir, DATA_EXTENSIONS, files);
  }
  for (const rootFile of ["middleware.ts", "instrumentation.ts", "next.config.js", "package.json", "ecosystem.config.cjs"]) {
    if (exists(rootFile)) files.push(rootFile);
  }
  return files.filter((file) => fs.statSync(path.join(REPO_ROOT_PATH, file)).size < 2_000_000);
}

test("no internal link, href or tool slug points at a removed feature (the 301 rules are the only place that may name the old paths)", () => {
  const offenders = [];
  for (const file of scannedFiles()) {
    if (file === REDIRECT_RULES_FILE) continue;
    const raw = read(file);
    const text = /\.(ts|tsx|mjs|js|cjs)$/.test(file) ? stripComments(raw) : raw;
    if (REMOVED_PATH_PATTERN.test(text)) offenders.push(`${file}: removed path`);
    if (/\.(ts|tsx|mjs|js|cjs)$/.test(file) && REMOVED_SLUG_PATTERN.test(text)) offenders.push(`${file}: removed slug`);
  }
  assert.deepEqual(offenders, []);
});

test("the redirect rules still keep the legacy URLs alive (outside links must not 404)", () => {
  const rules = stripComments(read(REDIRECT_RULES_FILE));
  assert.match(rules, /\/tools\/youbike/);
  assert.match(rules, /\/tools\/metro-alerts/);
});

test("the two removed API endpoints still only answer 410 Gone", () => {
  for (const file of ["app/api/youbike/route.ts", "app/api/metro-alerts/route.ts"]) {
    const source = stripComments(read(file));
    assert.match(source, /status:\s*410/, `${file} must answer 410`);
    assert.doesNotMatch(source, /getPool|from "@\/lib\/server\/db/, `${file} must not touch the database`);
  }
});

// ---------------------------------------------------------------------------------------------
// 2. 翻譯檔沒有殘留
// ---------------------------------------------------------------------------------------------

test("locales/*.json and lib/i18n/*.ts carry no leftover strings of the removed features", () => {
  const residue = /youbike|metro[-_ ]?alerts?|senior[-_ ]?tourism|stationMaps?|樂齡旅遊|樂齡套票|軌道營運通阻|營運通阻|公共自行車即時/i;
  const files = ["locales/zh-TW.json", "locales/en.json", "locales/ja.json", "locales/ko.json", ...listFiles("lib/i18n", [".ts"])];
  const offenders = files.filter((file) => residue.test(read(file)));
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------------------------------------
// 3. 排程數與 TDX 預算和文件一致
// ---------------------------------------------------------------------------------------------

const registerJobsSource = read("lib", "server", "cron", "registerJobs.ts");
const jobs = extractCronSchedules(registerJobsSource);
const schedulingDoc = read("docs", "domains", "10-scheduling-sync-ci.md").replace(/\r\n/g, "\n");
const runsPerDay = (expression) => {
  const parsed = parseCronExpression(expression);
  return parsed.minute.size * parsed.hour.size;
};

test("docs/domains/10-scheduling-sync-ci.md states the real in-app job count (cron.schedule( calls in registerJobs.ts)", () => {
  const match = schedulingDoc.match(/in-app node-cron[^\n]*?\|\s*(\d+) 個 job/);
  assert.ok(match, "the §1.1 table row must state the in-app job count as 'N 個 job'");
  assert.equal(Number(match[1]), jobs.length, "doc job count must equal the cron.schedule( count");
});

test("no test or doc pins a stale in-app job total (52, 50, 47 are all gone)", () => {
  assert.doesNotMatch(schedulingDoc, /目前\s*(52|50|47) 個 job/);
  const staleDocs = ["README.md", "docs/README.md", "docs/architecture.md"];
  for (const file of staleDocs) {
    assert.doesNotMatch(read(file), /(52|50|47) 個(排程|cron|job)/i, `${file} still quotes an old job total`);
  }
});

test("the TDX daily-request budget table in doc 10 equals what the schedules in registerJobs.ts add up to", () => {
  const railSystemsSource = stripComments(read("lib", "server", "transit", "railSystems.ts"));
  const systemCount = (railSystemsSource.match(/^\s*"[A-Z]+",\s*$/gm) || []).length;
  assert.ok(systemCount >= 8, "RAIL_SYSTEMS should list the rail systems, one per line");

  const alerts = jobs.find((job) => job.name === "transit-accessibility-alerts-cron.log");
  assert.ok(alerts, "the hourly elevator-outage job must be scheduled");
  const perDay = systemCount * runsPerDay(alerts.expression);

  // 整個 registerJobs.ts 只允許這一個 TDX 排程（其餘 TDX 呼叫端都是手動或半年同步）。
  const code = stripComments(registerJobsSource);
  assert.match(code, /runTransitFacilityAlertsSync/);
  assert.doesNotMatch(code, /runSeniorCardSync|runFacilitySync|fetchTdx|tdxGetJsonWithRetry|getTdxToken/);

  const totalMatch = schedulingDoc.match(/\|\s*\*\*合計\*\*[^\n]*?\*\*≈(\d[\d,]*)\*\*/);
  assert.ok(totalMatch, "the budget table must have a bold 合計 row with the per-day total");
  assert.equal(Number(totalMatch[1].replace(/,/g, "")), perDay, "documented TDX requests/day must equal systems x runs/day");
  assert.match(schedulingDoc, /只有電梯停用公告與管理員手動觸發的設施同步/, "the budget section must say who is allowed to hit TDX");
});

// ---------------------------------------------------------------------------------------------
// 4. TDX 剩餘呼叫端清單
// ---------------------------------------------------------------------------------------------

test("TDX callers outside lib/server/tdx/ are exactly: elevator alerts, facility sync (parking, audible signals), senior-card manual sync", () => {
  const callers = [];
  for (const file of [...listFiles("lib", [".ts", ".tsx"]), ...listFiles("app", [".ts", ".tsx"]), ...listFiles("components", [".ts", ".tsx"])]) {
    if (file.startsWith("lib/server/tdx/")) continue;
    if (/\b(getTdxToken|tdxGetJsonWithRetry)\b/.test(stripComments(read(file)))) callers.push(file);
  }
  assert.deepEqual(callers.sort(), [
    "lib/server/facilities/sources/tdxAudibleSignals.ts",
    "lib/server/facilities/sources/tdxParking.ts",
    "lib/server/seniorCard/tdxClient.ts",
    "lib/server/transit/runSync.ts",
    "lib/server/transit/tdxSeniorClient.ts",
  ]);
});

test("the only runners of those callers are: the hourly cron, the facilities/senior-card/transit admin routes", () => {
  const importers = (needle, roots = ["app", "lib"]) => {
    const found = [];
    for (const root of roots) {
      for (const file of listFiles(root, [".ts", ".tsx"])) {
        if (new RegExp(`\\b${needle}\\b`).test(stripComments(read(file)))) found.push(file);
      }
    }
    return found.sort();
  };
  assert.deepEqual(importers("runSeniorCardSync"), ["app/api/admin/senior-card-sync/route.ts", "lib/server/seniorCard/runSync.ts"]);
  assert.deepEqual(importers("runTransitFacilityAlertsSync"), [
    "app/api/admin/transit-accessibility-sync/route.ts",
    "lib/server/cron/registerJobs.ts",
    "lib/server/transit/runSync.ts",
  ]);
  // facilities-sync 是 TDX 停車／有聲號誌的唯一入口，只能由管理員路由（手動或半年同步）呼叫，不能被排程直接呼叫。
  const facilityRunners = importers("runFacilitySync");
  assert.ok(facilityRunners.includes("app/api/admin/facilities-sync/route.ts"));
  assert.ok(!facilityRunners.includes("lib/server/cron/registerJobs.ts"));
});

// ---------------------------------------------------------------------------------------------
// 5. llm-info 的工具數與分類數不寫死
// ---------------------------------------------------------------------------------------------

test("llm-info page derives its tool and category counts from the catalog instead of hard-coding them", () => {
  const source = stripComments(read("app", "(zh)", "llm-info", "LlmInfoClient.tsx"));
  assert.doesNotMatch(source, /\d+\s*(款|項)(實證)?工具|\d+\s*大分類/, "no literal 'N 款工具' / 'N 大分類'");
  assert.match(source, /tools\.length/);
  assert.match(source, /TOOL_GROUP_META\.length/);
});

// ---------------------------------------------------------------------------------------------
// 6. 改名後舊檔名消失、accessible_transit_sync_state 的處置保持記錄
// ---------------------------------------------------------------------------------------------

test("renamed TDX helper modules: the old file names are gone and the new ones hold the same data", () => {
  assert.ok(!exists("lib", "server", "transit", "railStationCounty.ts"));
  assert.ok(!exists("lib", "server", "transit", "tdxBusClient.ts"));
  assert.match(read("lib", "server", "transit", "railSystems.ts"), /export const RAIL_SYSTEMS/);
  assert.match(read("lib", "server", "tdx", "cities.ts"), /export const TDX_CITIES/);
});

test("accessible_transit_sync_state has no reader or writer left (kept only until the owner approves the DROP)", () => {
  const users = [];
  for (const file of [...listFiles("lib", [".ts", ".tsx"]), ...listFiles("app", [".ts", ".tsx"]), ...listFiles("components", [".ts", ".tsx"]), ...listFiles("scripts", [".mjs", ".ts"])]) {
    if (/accessible_transit_sync_state|accessibleTransitSyncState/.test(stripComments(read(file)))) users.push(file);
  }
  // schema.ts 的建表敘述與 mysql.ts 的建表註冊是僅存的兩處；有人加了讀寫就會失敗，提醒先更新 docs 的處置說明。
  assert.deepEqual(users.sort(), ["lib/server/db/mysql.ts", "lib/server/db/schema.ts"]);
  assert.match(schedulingDoc, /accessible_transit_sync_state/);
  assert.match(schedulingDoc, /建議刪除、待使用者批准/);
});
