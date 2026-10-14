// Source-text checks for the DB-adjacent parts of issue #582
// (global_earthquakes write threshold / sargable match query / retention
// cleanup cron) that the repo's testing conventions say not to exercise
// against a live DB — same "read the file, assert on its text" approach as
// lib/server/antiFraud/dbConventions.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");

test("upsertEarthquake's cross-source match query's time condition is a sargable range on event_time itself, not wrapped in a function", () => {
  const queries = read("./queries.ts");

  // Isolate just the WHERE clause of the match SELECT, up to ORDER BY — the
  // ORDER BY is still allowed to use TIMESTAMPDIFF (it only runs over the
  // handful of rows the WHERE clause already narrowed down, not the whole
  // table), but the WHERE clause's time condition must not wrap event_time.
  const selectMatch = queries.match(/SELECT id, sources_json[\s\S]*?ORDER BY/);
  assert.ok(selectMatch, "match SELECT statement not found in queries.ts");
  const whereClause = selectMatch[0];

  assert.match(
    whereClause,
    /event_time\s+BETWEEN\s+\?\s*-\s*INTERVAL\s+\?\s+SECOND\s+AND\s+\?\s*\+\s*INTERVAL\s+\?\s+SECOND/,
    "expected a BETWEEN range condition directly on event_time",
  );

  // The old bug: TIMESTAMPDIFF(...) wrapped around event_time in the WHERE
  // clause, which defeats idx_global_eq_time and forces a full table scan
  // on every write. Guard against it coming back.
  assert.ok(
    !/WHERE[\s\S]*TIMESTAMPDIFF\(SECOND,\s*event_time/.test(whereClause),
    "event_time must not be wrapped in TIMESTAMPDIFF (or any function) inside the WHERE clause — that defeats idx_global_eq_time",
  );
});

test("the match query's time tolerance is still ~120 seconds (MATCH_TIME_WINDOW_SECONDS unchanged)", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /MATCH_TIME_WINDOW_SECONDS\s*=\s*120/);
});

test("runEarthquakeSync applies the write threshold before upsertEarthquake", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /meetsWriteThreshold\(/);
  // Make sure the check actually runs ahead of the upsert call, not after.
  const thresholdIdx = runSync.indexOf("meetsWriteThreshold(");
  const upsertIdx = runSync.indexOf("upsertEarthquake(event)");
  assert.ok(thresholdIdx >= 0 && upsertIdx >= 0 && thresholdIdx < upsertIdx);
});

test("runEarthquakeRetentionCleanup deletes rows older than 30 days, in batches, under an advisory lock", () => {
  const cleanup = read("./runRetentionCleanup.ts");
  assert.match(cleanup, /RETENTION_DAYS\s*=\s*30/);
  assert.match(cleanup, /withAdvisoryLock\(/);
  assert.match(cleanup, /DELETE FROM global_earthquakes/);
  assert.match(cleanup, /LIMIT\s*\?/);
});

test("the earthquake retention cleanup cron job is registered at a minute offset documented as non-colliding", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runEarthquakeRetentionCleanup/);

  // Must run daily (day-of-month "*", not restricted like the monthly
  // fraud-domains job) at a specific hour:minute, not on a hash/interval grid.
  const scheduleMatch = registerJobs.match(
    /cron\.schedule\(\s*"(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*",\s*\n?\s*runGuarded\("earthquakes-retention-cleanup-cron\.log"/,
  );
  assert.ok(scheduleMatch, "expected a daily \"<minute> <hour> * * *\" cron.schedule entry for the retention cleanup job");
  const [, minute, hour] = scheduleMatch;

  // The comment immediately preceding this registration must document why
  // the chosen minute doesn't collide with the file's other jobs — same
  // convention every other job in this file follows (e.g. wra-iot-sync,
  // wra-water-outages). Look for a nearby comment block mentioning "collide"
  // or "collision" together with the chosen minute.
  const idx = registerJobs.indexOf("earthquakes-retention-cleanup-cron.log");
  const precedingContext = registerJobs.slice(Math.max(0, idx - 1600), idx);
  assert.match(
    precedingContext,
    /collide/i,
    "expected a comment documenting why this minute doesn't collide with other jobs, like the file's existing convention",
  );
  assert.ok(
    precedingContext.includes(minute),
    `expected the preceding comment to mention the chosen minute (${minute})`,
  );

  // Every other job in this hourly/daily grid occupies minutes 0,3,5,7,8,
  // 10,12,13,15,16,17,18,20,22,23,25,27,30,33,35,37,38,40,42,43,45,46,47,
  // 48,50,52,53,55 at some hour via an every-hour cadence, plus 30/33/38/45/
  // 50/53/58 specifically at hour 4. The new job must avoid all of them.
  const everyHourMinutes = new Set([
    0, 3, 5, 7, 8, 10, 12, 13, 15, 16, 17, 18, 20, 22, 23, 25, 27, 30, 33, 35,
    37, 38, 40, 42, 43, 45, 46, 47, 48, 50, 52, 53, 55,
  ]);
  const hour4Minutes = new Set([30, 33, 38, 45, 50, 53, 58]);
  const chosenMinute = Number(minute);
  assert.ok(!everyHourMinutes.has(chosenMinute), `minute ${chosenMinute} collides with an existing every-hour job`);
  if (Number(hour) === 4) {
    assert.ok(!hour4Minutes.has(chosenMinute), `minute ${chosenMinute} collides with an existing hour-4 daily job`);
  }
});
