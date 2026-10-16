// Source-text checks for the DB-, cron- and route-adjacent parts of the
// office-calendar pipeline (issue #691) that the repo's testing conventions say
// not to exercise against a live MySQL/network: table registration, advisory
// lock / ingest_errors wiring, cron-tick collisions, never-global-fetch, and the
// API routes' cache and auth behaviour. Same "read the file, assert on its
// text" approach as lib/server/waterQuality/dbConventions.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractCronSchedules, findCronCollisions, unusedMinutes } from "../cron/cronCollisions.mjs";

const read = (relativePath) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ----------------------------------------------------------------- schema ---

test("office_calendar_days is registered in runSchemaMigrations (the new table gets created)", () => {
  assert.match(read("../db/mysql.ts"), /TABLE_DDL\.officeCalendarDays/);
});

// ------------------------------------------------------------------- sync ---

test("runOfficeCalendarSync takes its own MySQL advisory lock and records the run in ingest_runs / ingest_errors", () => {
  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(/);
  assert.match(runSync, /office_calendar_sync_lock/);
  assert.match(runSync, /createIngestionRun\(/);
  assert.match(runSync, /finishIngestionRun\(/);
  assert.match(runSync, /writeIngestionError\(/);
  // A skipped (lock held) run is recorded, not silent.
  assert.match(runSync, /lock_held/);
});

test("the sync only ever fetches through lib/server/net/httpClient — never the global fetch (undici WASM OOMs on this host)", () => {
  const code = stripComments(read("./runSync.ts") + read("./syncCore.ts") + read("./datasetResources.ts"));
  assert.match(code, /httpGetJson\(/);
  assert.match(code, /httpRequest\(/);
  assert.ok(!/(?<![.\w])fetch\(/.test(code), "global fetch() is forbidden on this host");
  assert.match(code, /https:\/\/data\.gov\.tw\/api\/v2\/rest\/dataset\/14718/);
});

test("nothing in the pipeline deletes or truncates calendar rows: a day cannot stop existing, corrections are UPDATEs", () => {
  for (const file of ["./runSync.ts", "./syncCore.ts", "./queries.ts", "./upsertStatement.ts", "./calendarSource.ts"]) {
    const code = stripComments(read(file));
    assert.ok(!/DELETE\s+(\w+\s+)?FROM/i.test(code), `${file} must not DELETE FROM`);
    assert.ok(!/TRUNCATE/i.test(code), `${file} must not TRUNCATE`);
    assert.ok(!/DROP\s+TABLE/i.test(code), `${file} must not DROP TABLE`);
  }
});

test("writes go through the shared chunkedUpsert with the key-only-on-date statement, and DATE is read back as text", () => {
  const queries = stripComments(read("./queries.ts"));
  assert.match(queries, /chunkedUpsert\(/);
  assert.match(queries, /OFFICE_CALENDAR_UPSERT_SQL/);
  assert.match(queries, /DATE_FORMAT\(calendar_date, '%Y-%m-%d'\)/, "DATE columns are selected as strings so no time zone can move a day");
});

test("the typhoon-warning lookup reads the CAP warning dataset (W-C0034-001), not the cyclone-track rows, and answers null on failure", () => {
  const code = stripComments(read("./typhoonWarning.ts"));
  assert.match(code, /W-C0034-001/);
  assert.ok(!/W-C0034-005/.test(code), "a typhoon somewhere in the Pacific with no warning for Taiwan must not count");
  assert.match(code, /return null;/);
  assert.match(code, /memoizeQuery\(/);
});

// ------------------------------------------------------------------- cron ---

test("the office-calendar cron is weekly (Wednesday 06:34) and never shares a tick with any other registered job", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  assert.match(registerJobs, /runOfficeCalendarSync/);

  const jobs = extractCronSchedules(registerJobs);
  const own = jobs.find((job) => job.name === "office-calendar-sync-cron.log");
  assert.ok(own, "expected a cron.schedule entry for office-calendar-sync-cron.log");
  assert.equal(own.expression, "34 6 * * 3");

  const collisions = findCronCollisions(jobs).filter((c) => c.a.name === own.name || c.b.name === own.name);
  assert.deepEqual(
    collisions.map((c) => `${c.a.name} <> ${c.b.name} @ ${c.minutes}`),
    [],
    `office-calendar cron must not share a tick; unused minutes are ${JSON.stringify(unusedMinutes(jobs.filter((j) => j !== own)))}`,
  );
});

test("the office-calendar cron registration explains why it is weekly and why its minute does not collide, like every other job", () => {
  const registerJobs = read("../cron/registerJobs.ts");
  const idx = registerJobs.indexOf("office-calendar-sync-cron.log");
  assert.ok(idx > 0);
  const preceding = registerJobs.slice(Math.max(0, idx - 1500), idx);
  assert.match(preceding, /collide|碰撞|撞|同 tick/i);
  assert.ok(preceding.includes("34"), "the comment should mention the chosen minute");
  assert.match(preceding, /修正/, "the comment should say why weekly: the government revises mid-year");
});

// ----------------------------------------------------------------- routes ---

test("GET /api/tools/work-school-status has an explicit short Cache-Control, always carries the link-only closure guidance, and recomputes nothing from the host's zone", () => {
  const route = read("../../../app/api/tools/work-school-status/route.ts");
  assert.match(route, /cacheInit\("fast"\)/);
  assert.match(route, /export async function GET\(/);
  assert.match(route, /buildClosureGuidance\(/);
  assert.match(route, /buildWorkdayAnswer\(/);
  assert.match(route, /days: window\.rows/, "the raw window is returned so a client past midnight can recompute");
  assert.ok(!/getHours\(|getDate\(|getDay\(/.test(route));
});

test("POST /api/admin/office-calendar-sync is admin-gated and answers 202 immediately (same shape as the other /api/admin/*-sync routes)", () => {
  const route = read("../../../app/api/admin/office-calendar-sync/route.ts");
  assert.match(route, /requireAdminSecret\(request\)/);
  assert.match(route, /runOfficeCalendarSync\(\)/);
  assert.match(route, /status:\s*202/);
});

test("/api/home-status carries the workday section next to the other nationwide sections, so the status bar still costs one request", () => {
  const route = read("../../../app/api/home-status/route.ts");
  assert.match(route, /fetchHomeStatusWorkday/);
  assert.match(route, /workday: \(\) => fetchHomeStatusWorkday\(\)/);
  assert.match(route, /workday: alwaysOn\.workday/);
  assert.match(route, /workday: HomeStatusSection<HomeStatusWorkday>/);
});
