// Source-text checks for the DB-adjacent parts of the GDACS pipeline (issue
// #592 / #583) — same "read the file, assert on its text" approach as
// lib/server/antiFraud/dbConventions.test.mjs, rather than connecting to a
// live MySQL instance.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");

test("gdacs_events's UNIQUE KEY is (event_type, event_id) only — no time or episode column", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/gdacsEvents:\s*`([\s\S]*?)`,/);
  assert.ok(match, "gdacsEvents DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_gdacs_event\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_gdacs_event not found");

  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["event_type", "event_id"]);

  // Guard against any time- or episode-ish column sneaking into the key,
  // however it's named — this is exactly the cwa_station_weather bug class.
  const TIME_OR_EPISODE_LIKE = /year|month|date|time|episode|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(
      !TIME_OR_EPISODE_LIKE.test(column),
      `UNIQUE KEY column "${column}" looks time/episode-related`,
    );
  }

  // episode_id/start_time/end_time must exist as plain columns (not part of any key).
  assert.match(ddl, /episode_id VARCHAR/);
  assert.match(ddl, /start_time DATETIME/);
  assert.match(ddl, /end_time DATETIME/);
  // TC-only fields required by the issue.
  assert.match(ddl, /basin VARCHAR/);
  assert.match(ddl, /track_geojson JSON/);
});

test("gdacs_events is registered in runSchemaMigrations (new table gets created)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.gdacsEvents/);
});

test("runGdacsSync acquires a MySQL advisory lock before writing", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /gdacs_events_sync_lock/);
});

test("runGdacsSync writes failures to the existing ingest_errors mechanism and never truncates the table", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /writeIngestionError\(/);
  // runGdacsSync (the tick that can fail mid-fetch) must never itself issue
  // a DELETE/TRUNCATE against the table — only the separate, always-safe
  // runGdacsCleanup (daily retention sweep) does, via cleanupEndedGdacsEvents.
  const syncFnBody = runSync.slice(0, runSync.indexOf("export async function runGdacsCleanup"));
  assert.ok(
    !/DELETE FROM gdacs_events|TRUNCATE TABLE gdacs_events/i.test(syncFnBody),
    "runGdacsSync must not delete/truncate gdacs_events",
  );
});

test("upsertGdacsEvents is an INSERT ... ON DUPLICATE KEY UPDATE, not a DELETE+INSERT", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /INSERT INTO gdacs_events/);
  assert.match(queries, /ON DUPLICATE KEY UPDATE/);
  assert.ok(!/DELETE FROM gdacs_events/.test(queries.split("cleanupEndedGdacsEvents")[0]), "the upsert path itself must not delete rows");
});

test("cleanupEndedGdacsEvents only deletes events with a non-null end_time older than the retention window", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /DELETE FROM gdacs_events WHERE end_time IS NOT NULL AND end_time < DATE_SUB\(UTC_TIMESTAMP\(\), INTERVAL \? DAY\)/);
});

test("getRecentEqGdacsEvents (issue #595) filters to event_type = 'EQ' and never writes to gdacs_events", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /export const getRecentEqGdacsEvents/);
  const fnBody = queries.slice(queries.indexOf("export const getRecentEqGdacsEvents"));
  assert.match(fnBody, /event_type = 'EQ'/);
  assert.ok(
    !/INSERT INTO gdacs_events|UPDATE gdacs_events|DELETE FROM gdacs_events/.test(fnBody),
    "getRecentEqGdacsEvents must be read-only",
  );
  // Degrades to empty on a DB error (same convention as
  // getTieredEarthquakes/getGlobeWatchEarthquakeCandidates) rather than
  // throwing and taking the earthquake item's page down with it.
  assert.match(fnBody, /withConnectionFallback\(\s*\[\]/);
});

test("the GDACS sync cron job runs every 30 minutes and does not collide with any other job's minute grid", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runGdacsSync/);
  assert.match(registerJobs, /runGdacsCleanup/);

  const scheduleCalls = [...registerJobs.matchAll(/cron\.schedule\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scheduleCalls.includes("14,44 * * * *"), "gdacs-sync should be scheduled at 14,44 * * * *");
  assert.ok(scheduleCalls.includes("40 4 * * *"), "gdacs-cleanup should be scheduled daily at 40 4 * * *");

  // Full collision audit across every hourly-grid job in the file (any
  // expression whose first field isn't a day-restricted one) — every
  // individual minute used by any job must be used by exactly one job.
  const hourlyGridCalls = scheduleCalls.filter((expr) => {
    const fields = expr.split(" ");
    return fields[2] === "*" && fields[3] === "*" && fields[4] === "*";
  });
  const minuteOwners = new Map();
  for (const expr of hourlyGridCalls) {
    const minuteField = expr.split(" ")[0];
    const minutes = minuteField.startsWith("*/")
      ? Array.from({ length: 60 / Number(minuteField.slice(2)) }, (_, i) => String(i * Number(minuteField.slice(2))))
      : minuteField.split(",");
    for (const m of minutes) {
      minuteOwners.set(m, (minuteOwners.get(m) || 0) + 1);
    }
  }
  assert.equal(minuteOwners.get("14"), 1, "minute 14 must only be used by the new gdacs-sync job");
  assert.equal(minuteOwners.get("44"), 1, "minute 44 must only be used by the new gdacs-sync job");
});
