import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractCronSchedules } from "../lib/server/cron/cronCollisions.mjs";

// issue #727：YouBike 整個移除。這個檔案守住三件事：
//   1. /api/youbike 回 410 Gone（不是 404、也不碰資料庫）。
//   2. youbike_stations／youbike_sync_state 由 ensureSchema 冪等 DROP，且沒有任何地方還會把它們建回來。
//   3. 程式碼（頁面、同步、排程、種子、翻譯、工具目錄）沒有殘留。
// 舊網址的 301（含 /en /ja /ko）測試在 tests/middleware-permanent-redirects.test.mjs。

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

test("GET /api/youbike answers 410 Gone with an explicit Cache-Control, not 404 and not a database query", async () => {
  const route = await import(pathToFileURL(path.join(REPO_ROOT_PATH, "app", "api", "youbike", "route.ts")).href);
  const response = route.GET();
  assert.equal(response.status, 410);
  const cacheControl = response.headers.get("cache-control");
  assert.ok(cacheControl && /s-maxage=\d+/.test(cacheControl), `410 must declare its own Cache-Control, got ${cacheControl}`);
  const body = await response.json();
  assert.equal(body.ok, false);

  const code = stripComments(read("app", "api", "youbike", "route.ts"));
  assert.doesNotMatch(code, /import[^;]*(db|mysql|youbike\/)/i, "the 410 handler must not import any DB or YouBike code");
});

test("YouBike pages, component, sync code, seed and script are all gone", () => {
  for (const gone of [
    ["app", "(zh)", "tools", "youbike"],
    ["app", "[locale]", "tools", "youbike"],
    ["components", "Tools", "YoubikeContent.tsx"],
    ["lib", "server", "youbike"],
    ["data", "youbike-stations-seed.json"],
    ["scripts", "sync-youbike.mjs"],
  ]) {
    assert.ok(!hasAnyFile(...gone), `${gone.join("/")} should have been removed`);
  }
});

test("ensureSchema DROPs both YouBike tables idempotently and nothing creates, seeds or reads them again", () => {
  const mysql = stripComments(read("lib", "server", "db", "mysql.ts"));
  assert.match(mysql, /RETIRED_YOUBIKE_TABLES\s*=\s*\["youbike_stations",\s*"youbike_sync_state"\]/);
  assert.match(mysql, /DROP TABLE IF EXISTS/, "must be the idempotent form");
  assert.doesNotMatch(mysql, /DROP TABLE(?! IF EXISTS)/, "a bare DROP TABLE would fail on every run after the first");

  // The DROP must be reached from runSchemaMigrations (what ensureSchema runs), and a failure to
  // drop must not take the whole schema bootstrap down.
  const start = mysql.indexOf("const runSchemaMigrations");
  const dropAt = mysql.indexOf("DROP TABLE IF EXISTS", start);
  assert.ok(start >= 0 && dropAt > start, "the DROP lives inside runSchemaMigrations");
  const dropBlock = mysql.slice(dropAt - 200, dropAt + 250);
  assert.match(dropBlock, /try\s*\{/);
  assert.match(mysql.slice(dropAt, dropAt + 400), /catch\s*\(/);

  // No CREATE / INSERT / SELECT against either table anywhere in runtime code, in any order: a CREATE after
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
        if (rel === "tests/youbike-removal-727.test.mjs") continue;
        const code = stripComments(fs.readFileSync(full, "utf8"));
        if (/youbike_stations|youbike_sync_state|youbikeStations|youbikeSyncState/i.test(code)) offenders.push(rel);
      }
    }
  };
  walk(REPO_ROOT_PATH);
  // mysql.ts is the only file allowed to name the tables (it names them solely to DROP them).
  assert.deepEqual(offenders, ["lib/server/db/mysql.ts"]);
});

test("registerJobs.ts schedules no YouBike job (the */5 direct sync and the 11,26,39,54 TDX sync are gone)", () => {
  const source = read("lib", "server", "cron", "registerJobs.ts");
  const jobs = extractCronSchedules(source);
  assert.ok(!jobs.some((job) => /youbike/i.test(job.name)), "no youbike-*-cron.log job");
  assert.ok(!jobs.some((job) => job.expression === "*/5 * * * *"), "the only */5 job was YouBike's");
  assert.ok(!jobs.some((job) => job.expression === "11,26,39,54 * * * *"), "the YouBike TDX round's expression is gone");
  assert.doesNotMatch(stripComments(source), /youbike/i);
  // 不寫死總數：後續移除功能的票也會減少排程，精確數字以 docs/domains/10-scheduling-sync-ci.md 為準。
  assert.ok(jobs.length >= 30, `expected the reader to still find the other jobs, found ${jobs.length}`);
});

test("catalog, translations, nav and the tools index no longer mention the YouBike tool", async () => {
  const catalog = read("lib", "server", "tools", "catalog.ts");
  assert.doesNotMatch(catalog, /slug:\s*"youbike"/);
  assert.doesNotMatch(catalog, /"youbike"/, "no relatedSlugs entry may point at the removed tool");
  assert.doesNotMatch(read("lib", "i18n", "translatedPages.ts"), /youbike/i);
  assert.doesNotMatch(stripComments(read("lib", "i18n", "toolContent.ts")), /youbike/i);
  assert.doesNotMatch(read("app", "(zh)", "tools", "page.tsx"), /youbike/i);
  assert.doesNotMatch(read("lib", "server", "tools", "navModel.ts"), /youbike/i);
  for (const locale of ["en", "ja", "ko"]) {
    assert.doesNotMatch(read("locales", `${locale}.json`), /youbike/i, `${locale}.json`);
  }
});
