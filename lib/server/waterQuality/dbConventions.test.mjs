// Source-text checks for the DB-, cron- and route-adjacent parts of the 水質
// pipeline (issue #673, Track B B-13) that the repo's testing conventions say
// not to exercise against a live MySQL/network: schema shape, advisory-lock /
// ingest_errors wiring, cron-minute collisions, and the API routes' cache and
// auth behaviour. Same "read the file, assert on its text" approach as
// lib/server/antiFraud/dbConventions.test.mjs and lib/server/who/schema.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");

// ------------------------------------------------------------------ schema --

test("water_hardness_township's UNIQUE KEY is (county, district) only — no time/date column", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/waterHardnessTownship:\s*`([\s\S]*?)`,/);
  assert.ok(match, "waterHardnessTownship DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_water_hardness_township\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_water_hardness_township not found");
  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["county", "district"]);

  // Same guard every other new latest-state table carries (cwa_station_weather bug class).
  const TIME_LIKE = /year|month|date|time|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related`);
  }

  // The value and the sync timestamp are plain columns, never part of any key.
  assert.match(ddl, /hardness_mg_l DECIMAL\(\d+,\s*\d+\) NOT NULL/);
  assert.match(ddl, /synced_at DATETIME NOT NULL/);
  assert.equal((ddl.match(/UNIQUE KEY/g) || []).length, 1, "exactly one unique key");
});

test("water_hardness_township is registered in runSchemaMigrations (new table gets created)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.waterHardnessTownship/);
});

// -------------------------------------------------------------------- sync --

test("runWaterQualitySync takes its own MySQL advisory lock and records the run in ingest_runs/ingest_errors", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /water_quality_sync_lock/);
  assert.match(runSync, /createIngestionRun\(/);
  assert.match(runSync, /finishIngestionRun\(/);
  assert.match(runSync, /writeIngestionError\(/);
});

test("the sync reconciles through planSnapshotReconcile before any DELETE, and never truncates the table", () => {
  const runSync = read("./runSync.ts");
  const queries = read("./queries.ts");
  assert.match(runSync, /planSnapshotReconcile\(/);
  assert.ok(!/TRUNCATE/i.test(runSync) && !/TRUNCATE/i.test(queries));
  // The stale-row delete is keyed on synced_at (rows this run did not touch),
  // not on an unconditional DELETE of the whole table.
  assert.match(queries, /DELETE FROM water_hardness_township\s+WHERE synced_at < \?/);
  const planIdx = runSync.indexOf("planSnapshotReconcile(");
  const deleteIdx = runSync.indexOf("deleteStaleWaterHardness(");
  assert.ok(planIdx >= 0 && deleteIdx > planIdx, "the delete must be gated by the plan");
});

test("the hardness fetch goes through lib/server/net/httpClient (never global fetch) and throws on an empty/failed snapshot", () => {
  const source = read("./hardness.ts");
  const runSync = read("./runSync.ts");
  const combined = `${source}\n${runSync}`;
  assert.match(combined, /httpGetText\(/);
  assert.ok(!/(?<![.\w])fetch\(/.test(combined), "global fetch() is forbidden on this host (undici WASM OOM)");
  assert.match(combined, /https:\/\/www\.water\.gov\.tw\/opendata\/qual5\.csv/);
  assert.match(combined, /throw new Error\(/);
});

test("runWaterQualitySync is structured as a list of independent steps so a second dataset (B-14 plant quality) can be added without touching the hardness step", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /WATER_QUALITY_SYNC_STEPS/);
  assert.match(runSync, /key:\s*"hardness"/);
});

// -------------------------------------------------------------------- cron --

// Expands one cron field (a star, a number, a comma list, a range, or either with a /step) into the set of values it matches.
const expandField = (field, min, max) => {
  const out = new Set();
  for (const part of field.split(",")) {
    const [range, stepRaw] = part.split("/");
    const step = stepRaw ? Number(stepRaw) : 1;
    let lo = min;
    let hi = max;
    if (range !== "*") {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = b === undefined ? (stepRaw ? max : lo) : Number(b);
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
};
const parseCron = (expr) => {
  const [minute, hour, dom, , dow] = expr.trim().split(/\s+/);
  return {
    expr,
    minutes: expandField(minute, 0, 59),
    hours: expandField(hour, 0, 23),
    doms: expandField(dom, 1, 31),
    dows: expandField(dow, 0, 6),
  };
};
const intersects = (a, b) => [...a].some((v) => b.has(v));
const collides = (a, b) =>
  intersects(a.minutes, b.minutes) && intersects(a.hours, b.hours) && intersects(a.doms, b.doms) && intersects(a.dows, b.dows);

test("the water-quality cron is monthly (day-of-month 2), at an off-grid minute, and never shares a tick with any other registered job", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runWaterQualitySync/);

  const own = registerJobs.match(
    /cron\.schedule\(\s*"([^"]+)",\s*\n?\s*runGuarded\("water-quality-sync-cron\.log"/,
  );
  assert.ok(own, "expected a cron.schedule entry for water-quality-sync-cron.log");
  const ownJob = parseCron(own[1]);
  assert.equal(own[1], "29 5 2 * *", "spec §4 item 3 reserves 29 5 2 * * for the 水質 job");
  assert.deepEqual([...ownJob.doms], [2], "monthly on the 2nd, not daily");

  const allExpressions = [...registerJobs.matchAll(/cron\.schedule\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(allExpressions.length > 20, "expected to find the file's other cron expressions");
  const others = allExpressions.filter((expr) => expr !== own[1]).map(parseCron);
  for (const other of others) {
    assert.ok(!collides(ownJob, other), `water-quality cron "${own[1]}" shares a tick with "${other.expr}"`);
  }
});

test("the water-quality cron registration documents why its minute doesn't collide, like every other job in registerJobs.ts", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  const idx = registerJobs.indexOf("water-quality-sync-cron.log");
  assert.ok(idx > 0);
  const preceding = registerJobs.slice(Math.max(0, idx - 1800), idx);
  assert.match(preceding, /collide|碰撞|撞/i);
  assert.ok(preceding.includes("29"), "the comment should mention the chosen minute");
});

// ------------------------------------------------------------------ routes --

test("GET /api/tools/water-quality sets an explicit Cache-Control (not the origin's mystery 30-minute default) and returns the lookup for a given county", () => {
  const route = read("../../../app/api/tools/water-quality/route.ts");
  assert.match(route, /cacheInit\(/);
  assert.match(route, /export async function GET\(/);
  assert.match(route, /resolveHardnessLookup\(/);
  // Failure path: a 5xx, never a 200 that the edge would cache as "empty".
  assert.match(route, /status:\s*500/);
});

test("POST /api/admin/water-quality-sync is admin-gated and answers 202 immediately (same shape as the other /api/admin/*-sync routes)", () => {
  const route = read("../../../app/api/admin/water-quality-sync/route.ts");
  assert.match(route, /requireAdminSecret\(request\)/);
  assert.match(route, /runWaterQualitySync\(\)/);
  assert.match(route, /status:\s*202/);
});

// ---------------------------------------------------------------------- UI --

test("/tools/water-outages gets a 水質 tab whose coverage message and source attribution are on the page, not only in the API", () => {
  const content = read("../../../components/WaterOutages/WaterOutagesContent.tsx");
  assert.match(content, /WaterQualityTab/);
  assert.match(content, /水質/);

  const tab = read("../../../components/WaterOutages/WaterQualityTab.tsx");
  assert.match(tab, /WaterHardnessSection/);
  assert.match(tab, /台灣自來水公司/);
  assert.match(tab, /data\.gov\.tw\/dataset\/36605/);
  assert.match(tab, /非本站判定/);

  const section = read("../../../components/WaterOutages/WaterHardnessSection.tsx");
  assert.match(section, /resolveHardnessLookup/);
  assert.match(section, /lookup\.headline/);
  assert.match(section, /lookup\.message/);
});

test("the tab states that the dataset has no date column and shows this site's last sync time instead of a made-up data date", () => {
  const section = read("../../../components/WaterOutages/WaterHardnessSection.tsx");
  assert.match(section, /不含更新日期|沒有更新日期|無更新日期/);
  assert.match(section, /syncedAt/);
});

test("the water-outages catalog entry advertises the 水質 tab (keyword + dataset attribution)", () => {
  const catalog = read("../tools/catalog.ts");
  const start = catalog.indexOf('slug: "water-outages"');
  assert.ok(start > 0);
  const end = catalog.indexOf('slug: "emergency-hotlines"', start);
  const entry = catalog.slice(start, end);
  assert.match(entry, /水質/);
  assert.match(entry, /data\.gov\.tw\/dataset\/36605/);
});
