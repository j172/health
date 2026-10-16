// Issue #691 — where a request's calendar rows come from: the synced table,
// the committed seed, or nothing. Covers the "source failed" states the page
// must degrade through without ever guessing from the weekday.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import "./testHooks.mjs";

const { loadCalendarWindow, mergeCalendarRows, readOfficeCalendarSeed, WINDOW_DAYS_BEFORE, WINDOW_DAYS_AFTER } = await import(
  "./calendarSource.ts"
);
const { addDays, buildWorkdayAnswer } = await import("../../tools/workSchoolStatus/calendar.ts");

const seedFile = JSON.parse(
  fs.readFileSync(fileURLToPath(new URL("../../../data/office-calendar-seed.json", import.meta.url)), "utf8"),
);
const seedRows = Object.entries(seedFile.days).map(([date, [flag, note]]) => ({ date, isHoliday: flag === 2, note }));

const NOW = () => new Date("2026-10-16T05:00:00Z"); // 2026-10-16 13:00 Taipei
const WINDOW_FROM = "2026-10-15";
const WINDOW_TO = addDays("2026-10-16", WINDOW_DAYS_AFTER);

/** What the table would return for the window: every seed day, but with 2026-10-20 changed to a day off. */
const tableRows = (from, to) =>
  seedRows
    .filter((r) => r.date >= from && r.date <= to)
    .map((r) => (r.date === "2026-10-20" ? { ...r, isHoliday: true, note: "測試補假" } : r));

const deps = (overrides = {}) => ({
  now: NOW,
  getRows: async (from, to) => tableRows(from, to),
  getSyncedAt: async () => "2026-10-14T22:34:00.000Z",
  readSeed: () => seedFile,
  ...overrides,
});

test("the window covers yesterday through today + 62 days (Taipei), enough slack for a cached response and the 60-day list", async () => {
  assert.equal(WINDOW_DAYS_BEFORE, 1);
  assert.equal(WINDOW_DAYS_AFTER, 62);
  const window = await loadCalendarWindow(deps());
  assert.equal(window.from, WINDOW_FROM);
  assert.equal(window.to, WINDOW_TO);
});

test("table complete: source is db, not degraded, the sync time is reported and the seed is not mentioned", async () => {
  const window = await loadCalendarWindow(deps());
  assert.equal(window.source, "db");
  assert.equal(window.degraded, false);
  assert.equal(window.syncedAt, "2026-10-14T22:34:00.000Z");
  assert.equal(window.seedRetrievedAt, null);
  assert.equal(window.dbError, null);
  assert.equal(window.rows.length, WINDOW_DAYS_BEFORE + WINDOW_DAYS_AFTER + 1);
});

test("the table wins over the seed for a date it has (a correction synced after the seed was taken)", async () => {
  const window = await loadCalendarWindow(deps());
  const answer = buildWorkdayAnswer(window.rows, NOW());
  const changed = window.rows.find((r) => r.date === "2026-10-20");
  assert.deepEqual(changed, { date: "2026-10-20", isHoliday: true, note: "測試補假" });
  assert.ok(answer.upcoming.some((u) => u.date === "2026-10-20" && u.name === "測試補假"));
});

test("table throws: the seed answers, source is seed, degraded is true and the error is recorded — the answer is still correct", async () => {
  const window = await loadCalendarWindow(
    deps({
      getRows: async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:3306");
      },
    }),
  );
  assert.equal(window.source, "seed");
  assert.equal(window.degraded, true);
  assert.match(window.dbError, /ECONNREFUSED/);
  assert.equal(window.syncedAt, null);
  assert.equal(window.seedRetrievedAt, seedFile.retrievedAt);

  const answer = buildWorkdayAnswer(window.rows, NOW());
  assert.equal(answer.today.state, "workday");
  assert.equal(answer.tomorrow.offReason, "weekend");
});

test("table hangs: after the timeout the seed answers instead of the page waiting", async () => {
  const started = Date.now();
  const window = await loadCalendarWindow(deps({ getRows: () => new Promise(() => {}), dbTimeoutMs: 30 }));
  assert.ok(Date.now() - started < 2000, "did not wait for the hung query");
  assert.equal(window.source, "seed");
  assert.match(window.dbError, /timed out/);
});

test("table empty (before the first sync): the seed answers, source is seed", async () => {
  const window = await loadCalendarWindow(deps({ getRows: async () => [] }));
  assert.equal(window.source, "seed");
  assert.equal(window.degraded, true);
  assert.equal(window.syncedAt, null);
  assert.equal(window.dbError, null);
});

test("table has this year only: next year's days come from the seed and the source is mixed", async () => {
  const to2026 = "2026-12-31";
  const window = await loadCalendarWindow(
    deps({ now: () => new Date("2026-12-20T05:00:00Z"), getRows: async (from, to) => tableRows(from, to < to2026 ? to : to2026) }),
  );
  assert.equal(window.source, "mixed");
  assert.equal(window.degraded, true);
  assert.equal(window.seedRetrievedAt, seedFile.retrievedAt);
  const answer = buildWorkdayAnswer(window.rows, new Date("2026-12-20T05:00:00Z"));
  assert.ok(answer.upcoming.some((u) => u.date === "2027-01-01" && u.name === "開國紀念日"));
});

test("neither the table nor the seed has the window: source is none and every answer is unknown, never a weekday guess", async () => {
  const window = await loadCalendarWindow(deps({ getRows: async () => [], readSeed: () => null }));
  assert.equal(window.source, "none");
  assert.equal(window.degraded, true);
  assert.deepEqual(window.rows, []);
  const answer = buildWorkdayAnswer(window.rows, NOW());
  assert.equal(answer.today.state, "unknown");
  assert.equal(answer.tomorrow.state, "unknown");
  assert.equal(answer.windowTruncated, true);
});

test("a seed that is outside the window (data far in the past) contributes nothing", async () => {
  const window = await loadCalendarWindow(deps({ getRows: async () => [], now: () => new Date("2031-06-01T05:00:00Z") }));
  assert.equal(window.source, "none");
});

test("a malformed seed entry is skipped, not trusted", async () => {
  const badSeed = { ...seedFile, days: { "2026-10-16": "oops", "not-a-date": [2, "x"], "2026-10-17": [2, ""] } };
  const window = await loadCalendarWindow(deps({ getRows: async () => [], readSeed: () => badSeed }));
  assert.deepEqual(window.rows, [{ date: "2026-10-17", isHoliday: true, note: "" }]);
});

test("mergeCalendarRows: db rows override seed rows per date, counts say how many came from where, output is sorted", () => {
  const merged = mergeCalendarRows(
    [{ date: "2026-10-20", isHoliday: true, note: "db" }],
    [
      { date: "2026-10-21", isHoliday: false, note: "" },
      { date: "2026-10-20", isHoliday: false, note: "seed" },
    ],
  );
  assert.deepEqual(merged.rows.map((r) => [r.date, r.note]), [
    ["2026-10-20", "db"],
    ["2026-10-21", ""],
  ]);
  assert.equal(merged.fromDb, 1);
  assert.equal(merged.fromSeed, 1);
});

test("readOfficeCalendarSeed reads data/office-calendar-seed.json relative to the working directory and caches it", () => {
  const first = readOfficeCalendarSeed();
  assert.ok(first, "the committed seed must be readable from the repo root");
  assert.equal(first.retrievedAt, seedFile.retrievedAt);
  assert.equal(readOfficeCalendarSeed(), first, "cached object");
});
