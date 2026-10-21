import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractCronSchedules } from "../lib/server/cron/cronCollisions.mjs";

// issue #728：全台軌道營運通阻（metro-alerts）整個移除。這個檔案守住四件事：
//   1. /api/metro-alerts 回 410 Gone（不是 404、也不碰資料庫），且只留 GET。
//   2. metro_alerts 由 ensureSchema 冪等 DROP，且沒有任何地方還會把它建回。
//   3. 程式碼（頁面、同步、排程、種子、翻譯、工具目錄、導覽、情境頁）沒有殘留。
//   4. 不誤傷：無障礙交通頁自己的電梯停用公告排程與資料表、TDX 共用基礎設施都還在。
// 舊網址的 301（含 /en /ja /ko 與 ?lang=）測試在 tests/middleware-permanent-redirects.test.mjs。

const REPO_ROOT_PATH = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT_PATH, ...parts), "utf8");
// 目錄本身不算「還在」：git 刪完檔案後本機可能留下空資料夾；只要底下沒有任何檔案就視為已移除。
const hasAnyFile = (...parts) => {
  const full = path.join(REPO_ROOT_PATH, ...parts);
  if (!fs.existsSync(full)) return false;
  if (!fs.statSync(full).isDirectory()) return true;
  return fs.readdirSync(full, { withFileTypes: true }).some((e) => (e.isDirectory() ? hasAnyFile(...parts, e.name) : true));
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL && context.parentURL.includes("/node_modules/")) return nextResolve(specifier, context);
    if (/^next\/[\w/-]+$/.test(specifier)) {
      const file = path.join(REPO_ROOT_PATH, "node_modules", `${specifier}.js`);
      if (fs.existsSync(file)) return nextResolve(pathToFileURL(file).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");

test("GET /api/metro-alerts answers 410 Gone with an explicit Cache-Control, not 404 and not a database query", async () => {
  const route = await import(pathToFileURL(path.join(REPO_ROOT_PATH, "app", "api", "metro-alerts", "route.ts")).href);
  const response = route.GET();
  assert.equal(response.status, 410);
  const cacheControl = response.headers.get("cache-control");
  assert.ok(cacheControl && /s-maxage=\d+/.test(cacheControl), `410 must declare its own Cache-Control, got ${cacheControl}`);
  const body = await response.json();
  assert.equal(body.ok, false);

  // 只留 GET：其餘方法由 Next.js 自動回 405。
  assert.deepEqual(
    Object.keys(route).filter((k) => /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(k)),
    ["GET"],
  );

  const code = stripComments(read("app", "api", "metro-alerts", "route.ts"));
  assert.doesNotMatch(code, /import[^;]*(db|mysql|metroAlerts\/)/i, "the 410 handler must not import any DB or rail-alert code");
});

test("metro-alerts pages, component, sync code, seed and script are all gone", () => {
  for (const gone of [
    ["app", "(zh)", "tools", "metro-alerts"],
    ["app", "[locale]", "tools", "metro-alerts"],
    ["components", "Tools", "MetroAlertsContent.tsx"],
    ["lib", "server", "metroAlerts"],
    ["data", "metro-alerts-seed.json"],
    ["scripts", "sync-metro-alerts.mjs"],
  ]) {
    assert.ok(!hasAnyFile(...gone), `${gone.join("/")} should have been removed`);
  }
  // 只剩 410 route 一個檔案。
  const apiFiles = fs.readdirSync(path.join(REPO_ROOT_PATH, "app", "api", "metro-alerts"));
  assert.deepEqual(apiFiles, ["route.ts"]);
});

test("ensureSchema DROPs metro_alerts idempotently and nothing creates, alters, seeds or reads it again", () => {
  const mysql = stripComments(read("lib", "server", "db", "mysql.ts"));
  assert.match(mysql, /RETIRED_METRO_ALERTS_TABLES\s*=\s*\["metro_alerts"\]/);
  assert.match(mysql, /DROP TABLE IF EXISTS/, "must be the idempotent form");
  assert.doesNotMatch(mysql, /DROP TABLE(?! IF EXISTS)/, "a bare DROP TABLE would fail on every run after the first");

  // DROP 必須在 runSchemaMigrations（ensureSchema 執行的那段）裡，且失敗不能拖垮整個 schema 初始化。
  const start = mysql.indexOf("const runSchemaMigrations");
  const loopAt = mysql.indexOf("for (const legacyTable of RETIRED_METRO_ALERTS_TABLES)", start);
  assert.ok(start >= 0 && loopAt > start, "the DROP loop lives inside runSchemaMigrations");
  const loopBlock = mysql.slice(loopAt, loopAt + 450);
  assert.match(loopBlock, /try\s*\{/);
  assert.match(loopBlock, /DROP TABLE IF EXISTS/);
  assert.match(loopBlock, /catch\s*\(/);

  // runtime 程式碼任何地方都不能再 CREATE／ALTER／INSERT／SELECT 這張表（順序反了會在下次啟動悄悄建出空表）。
  // 掃描整個 repo（略過 node_modules、.git、docs、.claude 與本機建置輸出 .next*）。
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "docs", ".claude"].includes(entry.name) || entry.name.startsWith(".next")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|cjs|sql)$/.test(entry.name)) {
        const rel = path.relative(REPO_ROOT_PATH, full).replace(/\\/g, "/");
        if (rel === "tests/metro-alerts-removal-728.test.mjs") continue;
        const code = stripComments(fs.readFileSync(full, "utf8"));
        if (/metro_alerts|metroAlerts/i.test(code)) offenders.push(rel);
      }
    }
  };
  walk(REPO_ROOT_PATH);
  // mysql.ts 是唯一允許寫出表名的檔案（只為了 DROP 它）。
  assert.deepEqual(offenders, ["lib/server/db/mysql.ts"]);
});

test("registerJobs.ts schedules no metro-alerts job, but the elevator-outage job of the accessible-transit page is untouched", () => {
  const source = read("lib", "server", "cron", "registerJobs.ts");
  const jobs = extractCronSchedules(source);
  assert.ok(!jobs.some((job) => /metro/i.test(job.name)), "no metro-alerts-sync-cron.log job");
  assert.doesNotMatch(stripComments(source), /metro|runMetroAlertsSync/i);
  // 不誤傷：無障礙交通頁的電梯停用公告排程（另一個資料來源與資料表）。
  const elevator = jobs.find((job) => job.name === "transit-accessibility-alerts-cron.log");
  assert.ok(elevator, "transit-accessibility-alerts must still be scheduled");
  assert.equal(elevator.expression, "16 * * * *");
  assert.ok(fs.existsSync(path.join(REPO_ROOT_PATH, "lib", "server", "transit", "runSync.ts")));
  assert.match(stripComments(read("lib", "server", "db", "schema.ts")), /CREATE TABLE IF NOT EXISTS accessible_transit_facility_alerts/);
  // 不寫死總數：後續移除功能的票也會減少排程，精確數字以 docs/domains/10-scheduling-sync-ci.md 為準。
  assert.ok(jobs.length >= 30, `expected the reader to still find the other jobs, found ${jobs.length}`);
});

test("TDX token, rate limiter and circuit breaker are kept for the remaining callers", () => {
  for (const file of ["auth.ts", "rateLimiter.ts", "circuitBreaker.ts", "getJsonWithRetry.ts"]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT_PATH, "lib", "server", "tdx", file)), `lib/server/tdx/${file}`);
  }
});

test("catalog, translations, nav, guides and the tools index no longer mention the metro-alerts tool", () => {
  const catalog = read("lib", "server", "tools", "catalog.ts");
  assert.doesNotMatch(catalog, /slug:\s*"metro-alerts"/);
  assert.doesNotMatch(catalog, /"metro-alerts"/, "no relatedSlugs entry may point at the removed tool");
  assert.doesNotMatch(read("lib", "i18n", "translatedPages.ts"), /metro-alerts/);
  assert.doesNotMatch(stripComments(read("lib", "i18n", "toolContent.ts")), /metro-alerts/);
  assert.doesNotMatch(read("lib", "i18n", "guideContent.ts"), /metro-alerts/);
  assert.doesNotMatch(read("app", "(zh)", "tools", "page.tsx"), /metro-alerts/);
  assert.doesNotMatch(read("lib", "server", "tools", "navModel.ts"), /metro-alerts/);
  assert.doesNotMatch(read("components", "Tools", "AccessibleTransitContent.tsx"), /metro-alerts/);
  assert.doesNotMatch(read("README.md"), /metro-alerts/);
  for (const guide of [["app", "(zh)", "guides", "[slug]", "page.tsx"], ["app", "[locale]", "guides", "typhoon-earthquake", "page.tsx"]]) {
    assert.doesNotMatch(read(...guide), /metro-?alerts?/i, guide.join("/"));
  }
  for (const locale of ["en", "ja", "ko"]) {
    const json = read("locales", `${locale}.json`);
    assert.doesNotMatch(json, /metro-alerts|metroAlert|navMetroAlerts/i, `${locale}.json`);
    JSON.parse(json);
  }
});
