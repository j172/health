// Source-text checks for the DB-adjacent parts of the WHO DON pipeline (issue
// #596 / #583) — same "read the file, assert on its text" approach as
// lib/server/gdacs/schema.test.mjs / lib/server/antiFraud/dbConventions.test.mjs,
// rather than connecting to a live MySQL instance.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) =>
  readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");

test("who_outbreak_news's UNIQUE KEY is article_id only — no time column", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/whoOutbreakNews:\s*`([\s\S]*?)`,/);
  assert.ok(match, "whoOutbreakNews DDL entry not found in schema.ts");
  const ddl = match[1];

  const uniqueKeyMatch = ddl.match(/UNIQUE KEY\s+uq_who_outbreak_news_article\s*\(([^)]*)\)/);
  assert.ok(uniqueKeyMatch, "uq_who_outbreak_news_article not found");

  const keyColumns = uniqueKeyMatch[1].split(",").map((c) => c.trim());
  assert.deepEqual(keyColumns, ["article_id"]);

  // Guard against any time-ish column sneaking into the key, however it's
  // named — this is exactly the cwa_station_weather/gdacs_events bug class.
  const TIME_LIKE = /year|month|date|time|seen|at$/i;
  for (const column of keyColumns) {
    assert.ok(!TIME_LIKE.test(column), `UNIQUE KEY column "${column}" looks time-related`);
  }

  // publish_date must exist as a plain column (not part of any key).
  assert.match(ddl, /publish_date DATETIME NOT NULL/);
  // Required-by-the-issue columns.
  assert.match(ddl, /title VARCHAR/);
  assert.match(ddl, /disease_raw VARCHAR/);
  assert.match(ddl, /disease_mapped VARCHAR\(\d+\) NULL/);
  assert.match(ddl, /country_iso VARCHAR\(2\) NULL/);
  assert.match(ddl, /url VARCHAR/);
});

test("who_outbreak_news is registered in runSchemaMigrations (new table gets created)", () => {
  const mysql = read("../db/mysql.ts");
  assert.match(mysql, /TABLE_DDL\.whoOutbreakNews/);
});

test("runWhoDonSync acquires a MySQL advisory lock before writing", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /who_outbreak_news_sync_lock/);
});

test("runWhoDonSync writes failures to the existing ingest_errors mechanism and never truncates the table", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /writeIngestionError\(/);
  // runWhoDonSync (the tick that can fail mid-fetch) must never itself issue
  // a DELETE/TRUNCATE against the table — only the separate, always-safe
  // runWhoDonCleanup (daily retention sweep) does, via cleanupOldWhoOutbreakNews.
  const syncFnBody = runSync.slice(0, runSync.indexOf("export async function runWhoDonCleanup"));
  assert.ok(
    !/DELETE FROM who_outbreak_news|TRUNCATE TABLE who_outbreak_news/i.test(syncFnBody),
    "runWhoDonSync must not delete/truncate who_outbreak_news",
  );
});

test("upsertWhoOutbreakNews is an INSERT ... ON DUPLICATE KEY UPDATE, not a DELETE+INSERT", () => {
  const queries = read("./queries.ts");
  assert.match(queries, /INSERT INTO who_outbreak_news/);
  assert.match(queries, /ON DUPLICATE KEY UPDATE/);
  assert.ok(
    !/DELETE FROM who_outbreak_news/.test(queries.split("cleanupOldWhoOutbreakNews")[0]),
    "the upsert path itself must not delete rows",
  );
});

test("cleanupOldWhoOutbreakNews deletes rows published more than the retention window ago", () => {
  const queries = read("./queries.ts");
  assert.match(
    queries,
    /DELETE FROM who_outbreak_news WHERE publish_date < DATE_SUB\(UTC_TIMESTAMP\(\), INTERVAL \? DAY\)/,
  );
});

test("runWhoDonCleanup's retention window is 180 days (AC: 保留最近 180 天)", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /RETENTION_DAYS\s*=\s*180/);
});

test("the WHO DON sync cron job runs every 6 hours and does not collide with any other job's minute grid", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runWhoDonSync/);
  assert.match(registerJobs, /runWhoDonCleanup/);

  const scheduleCalls = [...registerJobs.matchAll(/cron\.schedule\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scheduleCalls.includes("19 0,6,12,18 * * *"), "who-don-sync should be scheduled at 19 0,6,12,18 * * *");
  assert.ok(scheduleCalls.includes("24 4 * * *"), "who-don-cleanup should be scheduled daily at 24 4 * * *");

  // Full collision audit across every hourly-grid job in the file (any
  // expression whose day/month/weekday fields are all "*") — every
  // individual minute used by any such job must be used by exactly one job,
  // same methodology as lib/server/gdacs/schema.test.mjs's own audit.
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
  assert.equal(minuteOwners.get("19"), 1, "minute 19 must only be used by the new who-don-sync job");

  // who-don-cleanup's "24 4 * * *": must not collide with any other
  // fixed-hour-4 daily job's minute, and minute 24 must not also be a
  // *true* hourly-grid job's minute (which would fire at hour 4 every day
  // too). Note minuteOwners's hourlyGridCalls filter (day/month/weekday all
  // "*") also catches fixed-hour daily jobs like this one — it's the same
  // filter lib/server/gdacs/schema.test.mjs uses — so who-don-cleanup
  // necessarily counts itself once; the assertion below is "exactly one
  // owner, and that's this job", not "zero owners".
  // (Not asserting global uniqueness across *every* existing hour-4 job
  // here — green-products and wra-catalog-sync already pre-existingly
  // share "30 4 * * *" before this change, which is a separate, pre-existing
  // condition this ticket isn't responsible for fixing.)
  const hour4CallsAt24 = scheduleCalls.filter((expr) => expr === "24 4 * * *");
  assert.equal(hour4CallsAt24.length, 1, "minute 24 at hour 4 must only be used by the new who-don-cleanup job");
  assert.equal(minuteOwners.get("24"), 1, "minute 24 must not be shared with any other job in the minute-grid audit");
});
