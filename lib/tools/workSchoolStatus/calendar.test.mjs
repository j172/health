// Issue #691 — the pure date + office-calendar logic behind 「今天要上班上課嗎？」.
// Rows come from the real excerpts in lib/server/officeCalendar/__fixtures__
// (parsed with the real parser), plus the committed 2026-2027 seed for
// full-year checks, so the expectations below are the government's own data
// (e.g. 2026-10-25 光復節 is a Sunday followed by a 補假 on the 26th; 2025-02-08
// is a Saturday 補行上班).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFixtureBytes } from "../../server/officeCalendar/testHooks.mjs";

const calendar = await import("./calendar.ts");
const { decodeCalendarBuffer, parseOfficeCalendarCsv } = await import("../../server/officeCalendar/parseOfficeCalendarCsv.ts");

const {
  addDays,
  buildHomeNextHolidayChip,
  buildHomeWorkdayChip,
  buildWorkdayAnswer,
  classifyDay,
  daysBetween,
  isValidIsoDate,
  taipeiDateOf,
  weekdayOf,
} = calendar;

const rowsOf = (fixture) => parseOfficeCalendarCsv(decodeCalendarBuffer(readFixtureBytes(fixture)).text);

const winter2025 = rowsOf("office-calendar-114-winter-utf8bom.csv");
const excerpt2026 = rowsOf("office-calendar-115-excerpt-utf8bom.csv");
const excerpt2027 = rowsOf("office-calendar-116-excerpt-utf8bom.csv");

const seed = JSON.parse(fs.readFileSync(fileURLToPath(new URL("../../../data/office-calendar-seed.json", import.meta.url)), "utf8"));
const seedRows = Object.entries(seed.days).map(([date, [flag, note]]) => ({ date, isHoliday: flag === 2, note }));

/** An instant that is `hh:mm` Asia/Taipei on `date`, expressed in UTC ms (Taipei = UTC+8). */
const taipeiInstant = (date, hhmm = "12:00") => Date.parse(`${date}T${hhmm}:00+08:00`);

// ---------------------------------------------------------------------------
// Asia/Taipei "today", independent of the host's time zone
// ---------------------------------------------------------------------------

test("taipeiDateOf uses Taiwan's +08:00 calendar date, flipping exactly at 16:00 UTC", () => {
  assert.equal(taipeiDateOf(Date.parse("2026-10-15T15:59:59Z")), "2026-10-15");
  assert.equal(taipeiDateOf(Date.parse("2026-10-15T16:00:00Z")), "2026-10-16");
  assert.equal(taipeiDateOf(Date.parse("2026-10-16T00:00:00Z")), "2026-10-16");
  assert.equal(taipeiDateOf(Date.parse("2026-10-16T15:59:59.999Z")), "2026-10-16");
  assert.equal(taipeiDateOf(new Date("2026-12-31T16:00:00Z")), "2027-01-01", "year rollover");
  assert.equal(taipeiDateOf(new Date("2028-02-28T16:00:00Z")), "2028-02-29", "leap day");
});

test("taipeiDateOf rejects a non-finite instant instead of answering with garbage", () => {
  assert.throws(() => taipeiDateOf(Number.NaN));
  assert.throws(() => taipeiDateOf(new Date("not a date")));
});

test("the date logic never reads the host's time zone: no local-time accessors in calendar.ts", () => {
  const source = fs
    .readFileSync(fileURLToPath(new URL("./calendar.ts", import.meta.url)), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  for (const forbidden of [
    /\.getDate\(/,
    /\.getDay\(/,
    /\.getHours\(/,
    /\.getMonth\(/,
    /\.getFullYear\(/,
    /\.getTimezoneOffset\(/,
    /toLocale(Date|Time)?String\(/,
    /new Date\(\s*\d/,
    /Date\.now\(/,
    /new Date\(\)/,
  ]) {
    assert.ok(!forbidden.test(source), `calendar.ts must not use ${forbidden}`);
  }
});

test("the same instant gives the same answer under different host time zones (child processes with TZ set)", () => {
  const script = `
    const { taipeiDateOf, buildWorkdayAnswer } = await import(${JSON.stringify(new URL("./calendar.ts", import.meta.url).href)});
    const instants = ["2026-10-15T15:59:59Z", "2026-10-15T16:00:00Z", "2026-12-31T16:00:00Z"];
    console.log(JSON.stringify(instants.map((i) => [taipeiDateOf(Date.parse(i)), buildWorkdayAnswer([], Date.parse(i)).today.weekday])));
  `;
  const outputs = ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Asia/Taipei"].map((tz) =>
    execFileSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", script], {
      env: { ...process.env, TZ: tz },
      encoding: "utf8",
    }).trim(),
  );
  assert.equal(new Set(outputs).size, 1, `answers differ by TZ: ${JSON.stringify(outputs)}`);
  assert.deepEqual(JSON.parse(outputs[0]), [["2026-10-15", 4], ["2026-10-16", 5], ["2027-01-01", 5]]);
});

// ---------------------------------------------------------------------------
// date helpers
// ---------------------------------------------------------------------------

test("addDays / daysBetween / weekdayOf work across month ends, leap days and year ends", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(addDays("2027-02-28", 1), "2027-03-01");
  assert.equal(addDays("2026-10-16", -16), "2026-09-30");
  assert.equal(daysBetween("2026-10-16", "2026-12-15"), 60);
  assert.equal(daysBetween("2026-12-15", "2026-10-16"), -60);
  assert.equal(weekdayOf("2026-10-16"), 5, "2026-10-16 is a Friday");
  assert.equal(weekdayOf("2026-10-10"), 6, "國慶日 2026 is a Saturday");
  assert.equal(weekdayOf("2025-02-08"), 6);
});

test("isValidIsoDate accepts only real YYYY-MM-DD dates", () => {
  for (const ok of ["2026-10-16", "2028-02-29", "2026-12-31"]) assert.equal(isValidIsoDate(ok), true, ok);
  for (const bad of ["2026-02-29", "2026-13-01", "2026-1-1", "20261016", "", "2026-10-16T00:00:00Z", null, undefined, 20261016]) {
    assert.equal(isValidIsoDate(bad), false, String(bad));
  }
});

// ---------------------------------------------------------------------------
// classifyDay: weekday / weekend / holiday / make-up / unknown
// ---------------------------------------------------------------------------

test("classifyDay: an ordinary weekday is a workday", () => {
  const status = classifyDay("2026-10-16", { date: "2026-10-16", isHoliday: false, note: "" });
  assert.deepEqual(status, { date: "2026-10-16", weekday: 5, state: "workday", offReason: null, name: null });
});

test("classifyDay: a weekend day off with no note is a plain weekend", () => {
  const status = classifyDay("2026-10-17", { date: "2026-10-17", isHoliday: true, note: "" });
  assert.equal(status.state, "off");
  assert.equal(status.offReason, "weekend");
  assert.equal(status.name, null);
});

test("classifyDay: a named holiday on a weekend is a holiday, not just a weekend (2026-10-10 國慶日, a Saturday)", () => {
  const row = excerpt2026.find((r) => r.date === "2026-10-10");
  const status = classifyDay("2026-10-10", row);
  assert.equal(status.state, "off");
  assert.equal(status.offReason, "holiday");
  assert.equal(status.name, "國慶日");
});

test("classifyDay: a 補假 on a weekday is a holiday (2026-10-26, Monday after 光復節 on a Sunday)", () => {
  const status = classifyDay("2026-10-26", excerpt2026.find((r) => r.date === "2026-10-26"));
  assert.equal(status.state, "off");
  assert.equal(status.offReason, "holiday");
  assert.equal(status.name, "補假");
});

test("classifyDay: a weekday off with no note is still a holiday, never a weekend", () => {
  const status = classifyDay("2026-10-14", { date: "2026-10-14", isHoliday: true, note: "" });
  assert.equal(status.state, "off");
  assert.equal(status.offReason, "holiday");
});

test("classifyDay: a Saturday that is a working day is a 補班日 (2025-02-08 補行上班)", () => {
  const status = classifyDay("2025-02-08", winter2025.find((r) => r.date === "2025-02-08"));
  assert.equal(status.state, "makeup-workday");
  assert.equal(status.name, "補行上班");
  assert.equal(status.weekday, 6);
});

test("classifyDay: no row means unknown — never guessed from the weekday", () => {
  for (const date of ["2026-10-17", "2026-10-16", "2025-02-08"]) {
    const status = classifyDay(date, undefined);
    assert.equal(status.state, "unknown", date);
    assert.equal(status.offReason, null);
    assert.equal(status.name, null);
  }
});

// ---------------------------------------------------------------------------
// buildWorkdayAnswer: today / tomorrow / 60-day list
// ---------------------------------------------------------------------------

test("answer for a Friday: today works, tomorrow is a Saturday off (real 2026 rows)", () => {
  const answer = buildWorkdayAnswer(seedRows, taipeiInstant("2026-10-16"));
  assert.equal(answer.asOf, "2026-10-16");
  assert.equal(answer.today.state, "workday");
  assert.equal(answer.tomorrow.date, "2026-10-17");
  assert.equal(answer.tomorrow.state, "off");
  assert.equal(answer.tomorrow.offReason, "weekend");
});

test("answer on 國慶日 itself: today is a named holiday off, tomorrow (Sunday) is a plain weekend", () => {
  const answer = buildWorkdayAnswer(seedRows, taipeiInstant("2026-10-10", "09:30"));
  assert.equal(answer.today.state, "off");
  assert.equal(answer.today.name, "國慶日");
  assert.equal(answer.tomorrow.offReason, "weekend");
});

test("the 60-day list from 2026-10-16 is exactly 光復節 and its 補假 — no plain weekends", () => {
  const answer = buildWorkdayAnswer(seedRows, taipeiInstant("2026-10-16"));
  assert.equal(answer.windowFrom, "2026-10-16");
  assert.equal(answer.windowTo, "2026-12-15");
  assert.deepEqual(
    answer.upcoming.map((u) => [u.date, u.kind, u.name]),
    [
      ["2026-10-25", "holiday", "臺灣光復暨金門古寧頭大捷紀念日"],
      ["2026-10-26", "holiday", "補假"],
    ],
  );
  assert.equal(answer.windowTruncated, false, "the seed covers the whole window");
});

test("the list is oldest-first, covers 春節 day by day and crosses the year boundary (2026-12-20 -> 2027-02-18)", () => {
  const answer = buildWorkdayAnswer(seedRows, taipeiInstant("2026-12-20"));
  const dates = answer.upcoming.map((u) => u.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(answer.windowTo, "2027-02-18");
  assert.ok(dates.includes("2026-12-25"), "行憲紀念日");
  assert.ok(dates.includes("2027-01-01"), "開國紀念日");
  for (const d of ["2027-02-04", "2027-02-05", "2027-02-06", "2027-02-07", "2027-02-08", "2027-02-09", "2027-02-10"]) {
    assert.ok(dates.includes(d), `春節 ${d}`);
  }
  assert.ok(!dates.includes("2027-01-02"), "a plain Saturday is not listed");
});

test("a 補班日 inside the window is listed with kind makeup-workday (2025-02-05 -> 2025-02-08)", () => {
  const answer = buildWorkdayAnswer(winter2025, taipeiInstant("2025-02-05"));
  const makeup = answer.upcoming.filter((u) => u.kind === "makeup-workday");
  assert.deepEqual(makeup.map((u) => [u.date, u.name, u.weekday]), [["2025-02-08", "補行上班", 6]]);
});

test("the window is inclusive of today + 60 and excludes today + 61", () => {
  const holiday = (date) => ({ date, isHoliday: true, note: "測試假日" });
  const rows = [holiday("2026-12-15"), holiday("2026-12-16")];
  const answer = buildWorkdayAnswer(rows, taipeiInstant("2026-10-16"));
  assert.deepEqual(answer.upcoming.map((u) => u.date), ["2026-12-15"]);
});

test("a custom window length is honoured", () => {
  const answer = buildWorkdayAnswer(seedRows, taipeiInstant("2026-10-16"), { windowDays: 10 });
  assert.equal(answer.windowTo, "2026-10-26");
  assert.deepEqual(answer.upcoming.map((u) => u.date), ["2026-10-25", "2026-10-26"]);
});

test("year boundary lookups: on 2026-12-31 tomorrow is 開國紀念日 2027-01-01 (rows from two different yearly files)", () => {
  const rows = [...excerpt2026, ...excerpt2027];
  const answer = buildWorkdayAnswer(rows, taipeiInstant("2026-12-31"));
  assert.equal(answer.today.state, "workday");
  assert.equal(answer.tomorrow.date, "2027-01-01");
  assert.equal(answer.tomorrow.state, "off");
  assert.equal(answer.tomorrow.name, "開國紀念日");

  const eve = buildWorkdayAnswer(rows, taipeiInstant("2026-12-30"));
  assert.equal(eve.tomorrow.state, "workday");
  assert.deepEqual(eve.upcoming.map((u) => u.date), ["2027-01-01"]);
});

test("one second before Taipei midnight is still today, one second after is tomorrow", () => {
  const before = buildWorkdayAnswer(seedRows, Date.parse("2026-10-16T23:59:59+08:00"));
  const after = buildWorkdayAnswer(seedRows, Date.parse("2026-10-17T00:00:01+08:00"));
  assert.equal(before.asOf, "2026-10-16");
  assert.equal(after.asOf, "2026-10-17");
  assert.equal(after.today.offReason, "weekend");
});

// ---------------------------------------------------------------------------
// no data / partial data: the degraded states
// ---------------------------------------------------------------------------

test("with no rows at all every answer is unknown, the list is empty and the window is flagged truncated", () => {
  const answer = buildWorkdayAnswer([], taipeiInstant("2026-10-16"));
  assert.equal(answer.today.state, "unknown");
  assert.equal(answer.tomorrow.state, "unknown");
  assert.deepEqual(answer.upcoming, []);
  assert.equal(answer.coveredFrom, null);
  assert.equal(answer.coveredTo, null);
  assert.equal(answer.windowTruncated, true);
});

test("rows that stop before the window ends flag the list as possibly incomplete and report where the data ends", () => {
  const answer = buildWorkdayAnswer(excerpt2026, taipeiInstant("2026-10-16"));
  assert.equal(answer.coveredFrom, "2026-10-05");
  assert.equal(answer.coveredTo, "2026-12-31");
  assert.equal(answer.windowTruncated, true, "11-01 .. 12-13 are missing from the excerpt");
  assert.deepEqual(
    answer.upcoming.map((u) => u.date),
    ["2026-10-25", "2026-10-26"],
    "what is known is still listed",
  );
});

test("a hole in the middle of otherwise complete data is not hidden by a later row", () => {
  const rows = seedRows.filter((r) => r.date !== "2026-11-20");
  const answer = buildWorkdayAnswer(rows, taipeiInstant("2026-10-16"));
  assert.equal(answer.windowTruncated, true);
});

test("today known but tomorrow missing: only tomorrow is unknown", () => {
  const rows = seedRows.filter((r) => r.date !== "2026-10-17");
  const answer = buildWorkdayAnswer(rows, taipeiInstant("2026-10-16"));
  assert.equal(answer.today.state, "workday");
  assert.equal(answer.tomorrow.state, "unknown");
});

test("data that ends yesterday (a stale cache or a missing year) leaves today unknown, not guessed", () => {
  const rows = seedRows.filter((r) => r.date <= "2026-10-15");
  const answer = buildWorkdayAnswer(rows, taipeiInstant("2026-10-16"));
  assert.equal(answer.today.state, "unknown");
  assert.equal(answer.tomorrow.state, "unknown");
});

// ---------------------------------------------------------------------------
// homepage chip
// ---------------------------------------------------------------------------

test("buildHomeWorkdayChip resolves the given instant's day from the rows (no typhoon-warning argument any more)", () => {
  const workday = buildHomeWorkdayChip(seedRows, taipeiInstant("2026-10-16"));
  assert.deepEqual(workday, { state: "workday", offReason: null, name: null });

  const holiday = buildHomeWorkdayChip(seedRows, taipeiInstant("2026-10-26"));
  assert.equal(holiday.state, "off");
  assert.equal(holiday.name, "補假");

  const unknown = buildHomeWorkdayChip([], taipeiInstant("2026-10-16"));
  assert.equal(unknown.state, "unknown");
});

test("the chip uses the caller's clock, so a cached row set from yesterday still answers for today", () => {
  // Rows were fetched when "today" was the 16th (window 15th..18th); the visitor's clock now says the 17th.
  const rows = seedRows.filter((r) => r.date >= "2026-10-15" && r.date <= "2026-10-18");
  assert.equal(buildHomeWorkdayChip(rows, taipeiInstant("2026-10-17")).offReason, "weekend");
  assert.equal(buildHomeWorkdayChip(rows, taipeiInstant("2026-10-15")).state, "workday");
});

test("buildHomeWorkdayChip resolves tomorrow by adding exactly 24h to the instant (Taiwan has no DST), matching HomeStatusBar's own technique", () => {
  const rows = seedRows.filter((r) => r.date >= "2026-10-15" && r.date <= "2026-10-18");
  const oneDayMs = 24 * 60 * 60 * 1000;
  // 2026-10-16 is a Friday (workday); +24h lands on Saturday the 17th (weekend).
  const today = buildHomeWorkdayChip(rows, taipeiInstant("2026-10-16"));
  const tomorrow = buildHomeWorkdayChip(rows, taipeiInstant("2026-10-16") + oneDayMs);
  assert.equal(today.state, "workday");
  assert.deepEqual(tomorrow, buildHomeWorkdayChip(rows, taipeiInstant("2026-10-17")));
  assert.equal(tomorrow.offReason, "weekend");
});

// ---------------------------------------------------------------------------
// buildHomeNextHolidayChip (Ticket 01 dynamic countdown and status resolution)
// ---------------------------------------------------------------------------

test("buildHomeNextHolidayChip: Monday to Saturday (5 days countdown)", () => {
  // 2026-10-12 is Monday (workday); next holiday is Saturday 2026-10-17 (weekend).
  const chip = buildHomeNextHolidayChip(seedRows, taipeiInstant("2026-10-12"));
  assert.equal(chip.mode, "workday-countdown");
  assert.equal(chip.emoji, "🏢");
  assert.equal(chip.labelKey, "homePage.statusBar.nextHolidayLabel");
  assert.equal(chip.defaultLabel, "下個假日");
  assert.equal(chip.daysUntil, 5);
  assert.equal(chip.targetName, "週六");
});

test("buildHomeNextHolidayChip: Wednesday to Saturday (3 days countdown)", () => {
  // 2026-10-14 is Wednesday (workday); next holiday is Saturday 2026-10-17.
  const chip = buildHomeNextHolidayChip(seedRows, taipeiInstant("2026-10-14"));
  assert.equal(chip.mode, "workday-countdown");
  assert.equal(chip.emoji, "🏢");
  assert.equal(chip.labelKey, "homePage.statusBar.nextHolidayLabel");
  assert.equal(chip.defaultLabel, "下個假日");
  assert.equal(chip.daysUntil, 3);
  assert.equal(chip.targetName, "週六");
});

test("buildHomeNextHolidayChip: Monday to Wednesday holiday (2 days countdown with holiday name)", () => {
  const rows = [
    { date: "2026-06-15", isHoliday: false, note: "" },
    { date: "2026-06-16", isHoliday: false, note: "" },
    { date: "2026-06-17", isHoliday: true, note: "端午節" },
    { date: "2026-06-18", isHoliday: false, note: "" },
  ];
  const chip = buildHomeNextHolidayChip(rows, taipeiInstant("2026-06-15"));
  assert.equal(chip.mode, "workday-countdown");
  assert.equal(chip.emoji, "🏢");
  assert.equal(chip.labelKey, "homePage.statusBar.nextHolidayLabel");
  assert.equal(chip.defaultLabel, "下個假日");
  assert.equal(chip.daysUntil, 2);
  assert.equal(chip.targetName, "端午節");
});

test("buildHomeNextHolidayChip: Friday to Saturday (tomorrow is off, 1 day)", () => {
  // 2026-10-16 is Friday; tomorrow 2026-10-17 is Saturday weekend.
  const chip = buildHomeNextHolidayChip(seedRows, taipeiInstant("2026-10-16"));
  assert.equal(chip.mode, "tomorrow-off");
  assert.equal(chip.emoji, "🏢");
  assert.equal(chip.labelKey, "homePage.statusBar.nextHolidayLabel");
  assert.equal(chip.defaultLabel, "下個假日");
  assert.equal(chip.daysUntil, 1);
  assert.equal(chip.targetName, "週六");
});

test("buildHomeNextHolidayChip: Saturday weekend (today is off, weekend)", () => {
  // 2026-10-17 is Saturday weekend.
  const chip = buildHomeNextHolidayChip(seedRows, taipeiInstant("2026-10-17"));
  assert.equal(chip.mode, "today-off");
  assert.equal(chip.emoji, "🏖️");
  assert.equal(chip.labelKey, "homePage.statusBar.todayOffLabel");
  assert.equal(chip.defaultLabel, "今日放假");
  assert.equal(chip.todayReason, "weekend");
  assert.equal(chip.todayName, null);
});

test("buildHomeNextHolidayChip: Sunday holiday (today is off, named holiday)", () => {
  // 2026-10-25 is Sunday 光復節.
  const chip = buildHomeNextHolidayChip(seedRows, taipeiInstant("2026-10-25"));
  assert.equal(chip.mode, "today-off");
  assert.equal(chip.emoji, "🏖️");
  assert.equal(chip.labelKey, "homePage.statusBar.todayOffLabel");
  assert.equal(chip.defaultLabel, "今日放假");
  assert.equal(chip.todayReason, "holiday");
  assert.equal(chip.todayName, "臺灣光復暨金門古寧頭大捷紀念日");
});

test("buildHomeNextHolidayChip: Saturday makeup workday (today is workday)", () => {
  // 2025-02-08 is Saturday 補行上班.
  const chip = buildHomeNextHolidayChip(winter2025, taipeiInstant("2025-02-08"));
  assert.equal(chip.mode, "makeup-workday");
  assert.equal(chip.emoji, "🏢");
  assert.equal(chip.labelKey, "homePage.statusBar.workdayWorkdayLabel");
  assert.equal(chip.defaultLabel, "今日上班");
});

test("buildHomeNextHolidayChip: clock crossing midnight flips from tomorrow-off to today-off", () => {
  // One second before midnight on Friday 2026-10-16.
  const before = buildHomeNextHolidayChip(seedRows, Date.parse("2026-10-16T23:59:59+08:00"));
  assert.equal(before.mode, "tomorrow-off");
  assert.equal(before.daysUntil, 1);
  assert.equal(before.targetName, "週六");

  // One second after midnight on Saturday 2026-10-17.
  const after = buildHomeNextHolidayChip(seedRows, Date.parse("2026-10-17T00:00:01+08:00"));
  assert.equal(after.mode, "today-off");
  assert.equal(after.emoji, "🏖️");
  assert.equal(after.todayReason, "weekend");
});

test("buildHomeNextHolidayChip: missing coverage degrades gracefully to unknown", () => {
  const empty = buildHomeNextHolidayChip([], taipeiInstant("2026-10-16"));
  assert.equal(empty.mode, "unknown");
  assert.equal(empty.emoji, "🏢");
  assert.equal(empty.labelKey, "homePage.statusBar.nextHolidayLabel");
  assert.equal(empty.defaultLabel, "下個假日");

  // Today known as workday, but future rows missing before any holiday is found
  const truncated = buildHomeNextHolidayChip([{ date: "2026-10-16", isHoliday: false, note: "" }], taipeiInstant("2026-10-16"));
  assert.equal(truncated.mode, "unknown");
});

// ---------------------------------------------------------------------------
// the committed seed is real data
// ---------------------------------------------------------------------------

test("the seed holds every day of 2026 and 2027 and agrees with the independently captured fixtures", () => {
  assert.equal(seedRows.length, 365 + 365);
  const seedByDate = new Map(seedRows.map((r) => [r.date, r]));
  for (const row of [...excerpt2026, ...excerpt2027]) {
    assert.deepEqual(seedByDate.get(row.date), row, `seed vs fixture for ${row.date}`);
  }
  // Spot facts straight from the official files.
  assert.equal(seedByDate.get("2026-10-10").note, "國慶日");
  assert.equal(seedByDate.get("2027-02-05").note, "農曆除夕");
  assert.equal(seedByDate.get("2026-10-16").isHoliday, false);
});
