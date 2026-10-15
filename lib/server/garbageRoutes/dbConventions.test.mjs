// Source-text checks for the DB-adjacent parts of the garbage-route pipeline
// (issue #674 / B-16) that repo convention says not to exercise against a live
// MySQL: schema shape, sync wiring, cron minute, and the API route's headers.
// Same "read the file, assert on its text" approach as
// lib/server/antiFraud/dbConventions.test.mjs and lib/server/who/schema.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");
const exists = (relativePath) => existsSync(fileURLToPath(new URL(relativePath, import.meta.url)));

test("garbage_route_stops: UNIQUE KEY is (city, line_id, stop_rank) — no time/date column", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/garbageRouteStops:\s*`([\s\S]*?)`,/);
  assert.ok(match, "garbageRouteStops DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_garbage_route_stop\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_garbage_route_stop not found");
  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["city", "line_id", "stop_rank"]);

  // The cwa_station_weather bug class: a time-ish column inside a "latest
  // state" table's key makes every sync INSERT instead of UPDATE.
  const TIME_LIKE = /year|month|date|time|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related`);
  }

  // The schedule columns are plain columns, never key columns.
  assert.match(ddl, /arrive_time VARCHAR\(\d+\) NULL/);
  assert.match(ddl, /depart_time VARCHAR\(\d+\) NULL/);
  assert.match(ddl, /garbage_days TINYINT UNSIGNED NULL/);
  assert.match(ddl, /recycling_days TINYINT UNSIGNED NULL/);
  assert.match(ddl, /foodscraps_days TINYINT UNSIGNED NULL/);
  assert.match(ddl, /synced_at DATETIME NOT NULL/);
});

test("garbage_route_stops is registered in runSchemaMigrations (new table gets created)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.garbageRouteStops/);
});

test("runGarbageRoutesSync takes its own MySQL advisory lock before writing", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /garbage_routes_sync_lock/);
});

test("runGarbageRoutesSync records failures via ingest_errors and isolates each city (one failing never blocks the other)", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /writeIngestionError\(/);
  // One try/catch per city, inside a loop over the sources, not one around everything.
  assert.match(runSync, /for \(const source of GARBAGE_ROUTE_SOURCES\)/);
  assert.match(runSync, /catch \(error\)/);
});

test("stale rows are pruned only through the reconcile guard, never with TRUNCATE or an unconditional DELETE", () => {
  const runSync = read("./runSync.ts");
  const queries = read("./queries.ts");
  assert.match(runSync, /decideSnapshotPrune\(/);
  assert.ok(!/TRUNCATE/i.test(runSync) && !/TRUNCATE/i.test(queries));
  // The only DELETE in queries.ts is the per-city "not seen this run" one.
  const deletes = queries.match(/DELETE FROM garbage_route_stops[^`]*/g) ?? [];
  assert.equal(deletes.length, 1);
  assert.match(deletes[0], /WHERE city = \?\s+AND synced_at < \?/);
});

test("route fetches go through the shared httpClient, never the global fetch()", () => {
  for (const file of ["./sources/taipei136515.ts", "./sources/ntpc125664.ts"]) {
    const source = read(file);
    assert.match(source, /httpGetText\(/, `${file} must use httpGetText`);
    assert.ok(!/(?<![.\w])fetch\(/.test(source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), `${file} must not call global fetch()`);
  }
});

test("cron: daily garbage-routes sync at 03:41 — a minute no other job uses on the 3 o'clock tick", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runGarbageRoutesSync/);
  assert.match(
    registerJobs,
    /cron\.schedule\(\s*"41 3 \* \* \*",\s*\n?\s*runGuarded\("garbage-routes-sync-cron\.log"/,
  );

  // Independent collision check (spec §4.3): expand every cron expression in
  // registerJobs.ts into the (hour, minute) ticks it fires on for an
  // unconstrained day, and make sure 03:41 is claimed by exactly one job.
  const expand = (field, min, max) => {
    const values = new Set();
    for (const part of field.split(",")) {
      const [range, stepRaw] = part.split("/");
      const step = stepRaw ? Number(stepRaw) : 1;
      let lo = min;
      let hi = max;
      if (range !== "*") {
        const [a, b] = range.split("-");
        lo = Number(a);
        hi = b === undefined ? (stepRaw ? max : Number(a)) : Number(b);
      }
      for (let v = lo; v <= hi; v += step) values.add(v);
    }
    return values;
  };
  const expressions = [...registerJobs.matchAll(/cron\.schedule\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(expressions.length > 20, "expected to find the existing cron expressions");
  const claimants = expressions.filter((expr) => {
    const [minute, hour] = expr.split(/\s+/);
    return expand(minute, 0, 59).has(41) && expand(hour, 0, 23).has(3);
  });
  assert.deepEqual(claimants, ["41 3 * * *"], `03:41 must belong to the garbage-routes job only, found: ${claimants.join(" | ")}`);
});

test("the admin sync trigger exists and is guarded by the admin secret", () => {
  assert.ok(exists("../../../app/api/admin/garbage-routes-sync/route.ts"));
  const route = read("../../../app/api/admin/garbage-routes-sync/route.ts");
  assert.match(route, /requireAdminSecret\(/);
  assert.match(route, /export async function POST\(/);
  assert.match(route, /runGarbageRoutesSync/);
});

test("GET /api/garbage-routes sets an explicit Cache-Control on success (spec §4.4) and validates the city param", () => {
  assert.ok(exists("../../../app/api/garbage-routes/route.ts"));
  const route = read("../../../app/api/garbage-routes/route.ts");
  assert.match(route, /cacheInit\(/);
  assert.match(route, /export async function GET\(/);
  assert.match(route, /parseGarbageRouteSearchParams\(/);
  assert.match(route, /status: 400/);
  // The route stores no user data and never logs the keyword the visitor typed.
  const consoleCalls = [...route.matchAll(/console\.(log|warn|error|info|debug)\(([^;]*?)\);/gs)];
  for (const [, , args] of consoleCalls) {
    assert.ok(!/keyword/i.test(args), `console.* call embeds the search keyword: ${args}`);
  }
});

test("search query is fully parameterized and escapes LIKE wildcards in the keyword", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /escapeLike\(/);
  assert.match(queries, /LIKE \? ESCAPE/);
  assert.ok(!/\$\{keyword\}/.test(queries), "keyword must never be interpolated into SQL text");
});
