import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractCronSchedules } from "../lib/server/cron/cronCollisions.mjs";

// issue #788：作物病蟲害即時預警整個移除。這個檔案守住四件事：
//   1. /api/pest-alerts 回 410 Gone（不是 404、也不碰資料庫）。
//   2. pest_alerts 由 ensureSchema 冪等 DROP，且沒有任何地方還會把它建回來。
//   3. 程式碼（頁面、同步、排程、種子、翻譯、工具目錄、側邊欄）沒有殘留。
//   4. 側邊欄移除這個 widget 後版面沒有留下破洞（AntiFraudSidebarWidget 緊接著渲染）。
// 舊網址的 301 測試在 tests/middleware-permanent-redirects.test.mjs。

const REPO_ROOT_PATH = fileURLToPath(new URL("../", import.meta.url));
const read = (...parts) => fs.readFileSync(path.join(REPO_ROOT_PATH, ...parts), "utf8");
const exists = (...parts) => fs.existsSync(path.join(REPO_ROOT_PATH, ...parts));
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

test("GET /api/pest-alerts answers 410 Gone with an explicit Cache-Control, not 404 and not a database query", async () => {
  const route = await import(pathToFileURL(path.join(REPO_ROOT_PATH, "app", "api", "pest-alerts", "route.ts")).href);
  const response = route.GET();
  assert.equal(response.status, 410);
  const cacheControl = response.headers.get("cache-control");
  assert.ok(cacheControl && /s-maxage=\d+/.test(cacheControl), `410 must declare its own Cache-Control, got ${cacheControl}`);
  const body = await response.json();
  assert.equal(body.ok, false);

  const code = stripComments(read("app", "api", "pest-alerts", "route.ts"));
  assert.doesNotMatch(code, /import[^;]*(db|mysql|pestAlerts\/)/i, "the 410 handler must not import any DB or pest-alerts code");
});

test("pest-alerts page (only (zh), never had a [locale] version), component, sidebar widget, server lib and seed are all gone", () => {
  for (const gone of [
    ["app", "(zh)", "tools", "pest-alerts"],
    ["components", "Tools", "PestAlertsContent.tsx"],
    ["components", "Tools", "PestAlertSidebarWidget.tsx"],
    ["lib", "server", "pestAlerts"],
    ["data", "pest-alerts-seed.json"],
  ]) {
    assert.ok(!hasAnyFile(...gone), `${gone.join("/")} should have been removed`);
  }
  // Confirm it genuinely never had a [locale] page, so this isn't accidentally
  // asserting the removal of something that was never there in the first place.
  assert.ok(!exists("app", "[locale]", "tools", "pest-alerts"), "pest-alerts never had a [locale] page");
});

test("ensureSchema DROPs the pest_alerts table idempotently and nothing creates, seeds or reads it again", () => {
  const mysql = stripComments(read("lib", "server", "db", "mysql.ts"));
  assert.match(mysql, /RETIRED_PEST_ALERTS_TABLES\s*=\s*\["pest_alerts"\]/);
  assert.match(mysql, /DROP TABLE IF EXISTS/, "must be the idempotent form");
  assert.doesNotMatch(mysql, /DROP TABLE(?! IF EXISTS)/, "a bare DROP TABLE would fail on every run after the first");

  // The DROP must be reached from runSchemaMigrations (what ensureSchema runs), and a failure to
  // drop must not take the whole schema bootstrap down.
  const start = mysql.indexOf("const runSchemaMigrations");
  const dropAt = mysql.indexOf("RETIRED_PEST_ALERTS_TABLES", start + 1);
  const dropCallAt = mysql.indexOf("DROP TABLE IF EXISTS", dropAt);
  assert.ok(start >= 0 && dropAt > start && dropCallAt > dropAt, "the DROP lives inside runSchemaMigrations");
  const dropBlock = mysql.slice(dropAt - 50, dropCallAt + 250);
  assert.match(dropBlock, /try\s*\{/);
  assert.match(mysql.slice(dropCallAt, dropCallAt + 400), /catch\s*\(/);

  // No CREATE / INSERT / SELECT against the table anywhere in runtime code, in any order: a CREATE after
  // the DROP would silently rebuild an empty table on the next boot.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      // .next* 是本機建置輸出（可能是移除前建的舊檔），不是原始碼。
      if (["node_modules", ".git", "docs", ".claude"].includes(entry.name) || entry.name.startsWith(".next")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
        const rel = path.relative(REPO_ROOT_PATH, full).replace(/\\/g, "/");
        if (rel === "tests/pest-alerts-removal-788.test.mjs") continue;
        const code = stripComments(fs.readFileSync(full, "utf8"));
        // The literal table name only — not a broader "pestAlerts" substring match, which would
        // false-positive on unrelated identifiers like "PestAlertSidebarWidget" (its camelCase
        // text happens to contain "pestAlertS...") that other tests reference only to assert absence.
        if (/pest_alerts/i.test(code)) offenders.push(rel);
      }
    }
  };
  walk(REPO_ROOT_PATH);
  // mysql.ts is the only file allowed to name the table (it names it solely to DROP it).
  assert.deepEqual(offenders, ["lib/server/db/mysql.ts"]);
});

test("schema.ts no longer declares a pest_alerts CREATE TABLE", () => {
  assert.doesNotMatch(read("lib", "server", "db", "schema.ts"), /pest_alerts|pestAlerts/i);
});

test("registerJobs.ts schedules no pest-alerts job (the 12 0,6,12,18 * * * every-6-hours sync is gone)", () => {
  const source = read("lib", "server", "cron", "registerJobs.ts");
  const jobs = extractCronSchedules(source);
  assert.ok(!jobs.some((job) => /pest/i.test(job.name)), "no pest-alerts-*-cron.log job");
  assert.ok(!jobs.some((job) => job.expression === "12 0,6,12,18 * * *"), "pest-alerts' every-6-hours expression is gone");
  assert.doesNotMatch(stripComments(source), /pest/i);
  // 不寫死總數：後續移除功能的票也會減少排程，精確數字以 docs/domains/10-scheduling-sync-ci.md 為準。
  assert.ok(jobs.length >= 30, `expected the reader to still find the other jobs, found ${jobs.length}`);
});

test("catalog, translations, nav and the tools index no longer mention the pest-alerts tool", () => {
  const catalog = read("lib", "server", "tools", "catalog.ts");
  assert.doesNotMatch(catalog, /slug:\s*"pest-alerts"/);
  assert.doesNotMatch(catalog, /"pest-alerts"/, "no relatedSlugs/INDEXABLE_SLUGS entry may point at the removed tool");
  assert.doesNotMatch(read("lib", "i18n", "translatedPages.ts"), /pest-alerts/i);
  assert.doesNotMatch(stripComments(read("lib", "i18n", "toolContent.ts")), /pest-alerts/i);
  assert.doesNotMatch(read("app", "(zh)", "tools", "page.tsx"), /pest-alerts/i);
  assert.doesNotMatch(read("lib", "server", "tools", "navModel.ts"), /pest-alerts/i);
  for (const locale of ["en", "ja", "ko"]) {
    assert.doesNotMatch(read("locales", `${locale}.json`), /pest-alerts/i, `${locale}.json`);
  }
});

test("NewsSidebar no longer renders or imports PestAlertSidebarWidget, and the widget removal leaves no gap (AntiFraudSidebarWidget renders immediately after CdcAlertSidebarWidget)", () => {
  const src = read("components", "News", "NewsSidebar.tsx");
  assert.doesNotMatch(src, /PestAlertSidebarWidget/);
  const cdcAt = src.indexOf("<CdcAlertSidebarWidget");
  const antiFraudAt = src.indexOf("<AntiFraudSidebarWidget");
  assert.ok(cdcAt !== -1 && antiFraudAt !== -1 && antiFraudAt > cdcAt, "AntiFraudSidebarWidget must render right after CdcAlertSidebarWidget, no gap left by the removed widget");
  const between = src.slice(cdcAt, antiFraudAt);
  assert.ok(!/<[A-Z]\w*Widget/.test(between.replace("<CdcAlertSidebarWidget", "")), "nothing else should render between CdcAlertSidebarWidget and AntiFraudSidebarWidget");
});
