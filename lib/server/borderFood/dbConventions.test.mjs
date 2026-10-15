// Source-text checks for the DB-adjacent and UI-adjacent parts of the border-
// food (邊境查驗不合格食品, dataset 6133) feature — issue #671, spec
// docs/2.0/track-b-opendata-phase2-3-spec.md §4/§5/§6 B-6. Same "read the file,
// assert on its text" approach as lib/server/antiFraud/dbConventions.test.mjs:
// the repo's testing conventions say not to exercise a live MySQL here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");
const exists = (relativePath) => existsSync(fileURLToPath(new URL(relativePath, import.meta.url)));

const schemaDdl = () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/borderFoodRejections:\s*`([\s\S]*?)`,/);
  assert.ok(match, "borderFoodRejections DDL entry not found in schema.ts");
  return match[1];
};

// ---- schema ---------------------------------------------------------------

test("border_food_rejections's UNIQUE KEY is row_hash only — no time/date column (cwa_station_weather bug class)", () => {
  const ddl = schemaDdl();
  const uniqueKeys = [...ddl.matchAll(/UNIQUE KEY\s+(\w+)\s*\(([^)]*)\)/g)];
  assert.equal(uniqueKeys.length, 1, "exactly one UNIQUE KEY expected");
  const keyColumns = uniqueKeys[0][2].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["row_hash"]);

  const TIME_LIKE = /year|month|date|time|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related`);
  }
});

test("border_food_rejections keeps the dates as plain columns and never stores the importer address or the image", () => {
  const ddl = schemaDdl();
  assert.match(ddl, /published_on DATE NULL/);
  assert.match(ddl, /inspection_accepted_on DATE NULL/);
  assert.match(ddl, /duplicate_count/);
  assert.match(ddl, /synced_at DATETIME NOT NULL/);
  // The issue's hard requirement: the page must not carry the importer
  // address or the attached image — so the table must not even store them.
  assert.ok(!/address|image|photo|img|attach/i.test(ddl), "DDL must not declare any address/image column");
});

test("border_food_rejections is registered in runSchemaMigrations (new table gets created)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.borderFoodRejections/);
});

// ---- sync -----------------------------------------------------------------

test("runBorderFoodRejectionsSync takes its own advisory lock and logs failures to ingest_errors", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /border_food_rejections_sync_lock/);
  assert.match(runSync, /writeIngestionError\(/);
});

test("the sync checks the snapshot guard BEFORE writing, and only deletes stale rows AFTER a successful upsert", () => {
  const runSync = read("./runSync.ts");
  const guardAt = runSync.indexOf("evaluateSnapshotGuard(");
  const upsertAt = runSync.indexOf("upsertBorderFoodRejections(");
  const deleteAt = runSync.indexOf("deleteBorderFoodRejectionsNotSyncedSince(");
  assert.ok(guardAt > -1 && upsertAt > -1 && deleteAt > -1, "guard, upsert and stale-delete calls must all be present");
  assert.ok(guardAt < upsertAt, "guard must run before the upsert");
  assert.ok(upsertAt < deleteAt, "stale rows may only be deleted after the upsert succeeded");
  // the sync function itself never issues raw DELETE/TRUNCATE SQL
  assert.ok(!/DELETE FROM|TRUNCATE/i.test(runSync));
});

test("queries: upsert is INSERT ... ON DUPLICATE KEY UPDATE and the stale sweep is keyed on synced_at, never a blanket delete", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /INSERT INTO border_food_rejections/);
  assert.match(queries, /ON DUPLICATE KEY UPDATE/);
  assert.match(queries, /DELETE FROM border_food_rejections WHERE synced_at < \?/);
  assert.ok(!/TRUNCATE/i.test(queries));
  const deletes = queries.match(/DELETE FROM border_food_rejections[^`]*/g) || [];
  assert.equal(deletes.length, 1, "only the synced_at sweep may delete");
});

test("queries never select or return an importer address or image column", () => {
  const queries = read("./queries.ts");
  assert.ok(!/importer_address|image_url|photo|attach/i.test(queries));
  const parser = read("./sources/fdaBorderRejections.ts");
  // The parser may *name* the two excluded upstream columns in a deny list /
  // comment, but must not map them onto any output field.
  assert.ok(!/importerAddress|imageUrl|image_url|importer_address/.test(parser));
});

// ---- cron -----------------------------------------------------------------

test("the border-food sync cron job is weekly, uses 39 2 * * 1, and collides with no other tick", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runBorderFoodRejectionsSync/);
  assert.match(
    registerJobs,
    /cron\.schedule\(\s*"39 2 \* \* 1",\s*\n?\s*runGuarded\("border-food-rejections-sync-cron\.log"/,
  );

  const scheduleCalls = [...registerJobs.matchAll(/cron\.schedule\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.equal(scheduleCalls.filter((expr) => expr === "39 2 * * 1").length, 1, "the exact tick must be unique");

  // Minute 39 must not appear on any job whose hour field is a wildcard/step
  // (i.e. one that fires at 02:39 on Mondays by virtue of running every
  // hour), and must not be a multiple of 5 (youbike's */5 grid).
  assert.notEqual(39 % 5, 0);
  for (const expr of scheduleCalls) {
    if (expr === "39 2 * * 1") continue;
    const [minute, hour, dom, , dow] = expr.split(" ");
    const hourMatches2 = hour === "*" || hour.startsWith("*/") || hour.split(",").includes("2");
    const dayMatchesMonday = dow === "*" || dow.split(",").includes("1");
    const domMatches = dom === "*";
    if (!(hourMatches2 && dayMatchesMonday && domMatches)) continue;
    const minuteSet = minute.startsWith("*/")
      ? Array.from({ length: 60 / Number(minute.slice(2)) }, (_, i) => String(i * Number(minute.slice(2))))
      : minute === "*"
        ? Array.from({ length: 60 }, (_, i) => String(i))
        : minute.split(",");
    assert.ok(!minuteSet.includes("39"), `"${expr}" also fires at minute 39 of the 02:00 hour on Mondays`);
  }
});

// ---- API route ------------------------------------------------------------

test("GET /api/food-safety/border-rejections declares an explicit Cache-Control (no inherited 30-minute edge default)", () => {
  const route = read("../../../app/api/food-safety/border-rejections/route.ts");
  assert.match(route, /Cache-Control/);
  assert.match(route, /s-maxage=\d+/);
  // Empty results and errors must never be edge-cached (the "0 筆" Cloudflare
  // cache incident after an empty first deploy).
  assert.match(route, /no-store/);
  const responses = (route.match(/NextResponse\.json\(/g) || []).length;
  const headerUses = (route.match(/headers:/g) || []).length;
  assert.ok(headerUses >= responses, "every NextResponse.json(...) call must attach a Cache-Control header");
});

test("the API route clamps page sizes to the site-wide 30/50/100 and escapes LIKE wildcards in user input", () => {
  const route = read("../../../app/api/food-safety/border-rejections/route.ts");
  assert.match(route, /PAGE_SIZE_OPTIONS/);
  const queries = read("./queries.ts");
  assert.match(queries, /escapeLike/);
});

test("the API route never exposes an importer address or image", () => {
  const route = read("../../../app/api/food-safety/border-rejections/route.ts");
  assert.ok(!/importerAddress|importer_address|imageUrl|image_url/.test(route));
});

test("a manual admin trigger exists for the post-deploy first sync, behind the admin secret", () => {
  assert.ok(exists("../../../app/api/admin/border-food-rejections-sync/route.ts"));
  const route = read("../../../app/api/admin/border-food-rejections-sync/route.ts");
  assert.match(route, /requireAdminSecret\(request\)/);
  assert.match(route, /runBorderFoodRejectionsSync/);
});

// ---- UI / catalog ---------------------------------------------------------

test("the food-safety page renders the pesticide dashboard and the new border-rejections tab behind ToolTypeTabs", () => {
  const page = read("../../../app/(zh)/tools/food-safety/page.tsx");
  assert.match(page, /FoodSafetyTabs/);
  const tabs = read("../../../components/Tools/FoodSafetyTabs.tsx");
  assert.match(tabs, /ToolTypeTabs/);
  assert.match(tabs, /FoodSafetyContent/);
  assert.match(tabs, /BorderFoodRejectionsContent/);
});

test("the border-rejections tab never renders an importer address or an attached image, and carries the source/not-our-judgement disclaimer", () => {
  const component = read("../../../components/Tools/BorderFoodRejectionsContent.tsx");
  assert.ok(!/importerAddress|importer_address|imageUrl|image_url|GetFile\.ashx/.test(component));
  assert.ok(!/<img\b|next\/image|<Image\b/.test(component), "no images may be rendered on this tab");
  assert.match(component, /食品藥物管理署/);
  assert.match(component, /非本站判定/);
  assert.match(component, /政府資料開放授權條款/);
  // freshness label (spec §4 item 8): the data's own date, not data.gov.tw's metadata date
  assert.match(component, /資料日期/);
  // the three required filters
  assert.match(component, /產地/);
  assert.match(component, /不合格原因/);
  assert.match(component, /發布日/);
});

test("the food-safety catalog entry advertises the border-rejections tab (no new tool, so no counter changes)", () => {
  const catalog = read("../tools/catalog.ts");
  const start = catalog.indexOf('slug: "food-safety"');
  assert.ok(start > -1);
  // The working tree is CRLF on Windows (core.autocrlf), so match either ending.
  const rest = catalog.slice(start + 10);
  const nextEntry = rest.search(/\r?\n  \{\r?\n    slug:/);
  const entry = catalog.slice(start, nextEntry > -1 ? start + 10 + nextEntry : undefined);
  assert.match(entry, /邊境查驗/);
});
