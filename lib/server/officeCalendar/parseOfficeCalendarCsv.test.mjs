// Issue #691 — the office-calendar CSV decoder and parser, against real slices
// of the files data.gov.tw 14718 serves (see __fixtures__): UTF-8 with a BOM and
// CRLF (115, 116, the 114 original) and the Big5 114 revision of 2025-10-20.
import test from "node:test";
import assert from "node:assert/strict";
import { readFixtureBytes } from "./testHooks.mjs";

const { assertFullCalendarYear, decodeCalendarBuffer, parseOfficeCalendarCsv, OfficeCalendarParseError } = await import(
  "./parseOfficeCalendarCsv.ts"
);
const { addDays, weekdayOf, WEEKDAY_LABELS_ZH } = await import("../../tools/workSchoolStatus/calendar.ts");

const parseFixture = (name) => parseOfficeCalendarCsv(decodeCalendarBuffer(readFixtureBytes(name)).text);
const byDate = (rows) => new Map(rows.map((row) => [row.date, row]));

const HEADER = "西元日期,星期,是否放假,備註";
const csv = (...lines) => [HEADER, ...lines].join("\r\n") + "\r\n";

// ------------------------------------------------------------------ decode --

test("decodeCalendarBuffer: a UTF-8 file with a BOM decodes as UTF-8 and the BOM is not left in the text", () => {
  const { text, encoding } = decodeCalendarBuffer(readFixtureBytes("office-calendar-116-excerpt-utf8bom.csv"));
  assert.equal(encoding, "utf-8");
  assert.ok(text.startsWith("西元日期"), "BOM stripped");
  assert.ok(text.includes("開國紀念日"));
});

test("decodeCalendarBuffer: the Big5 revision (no BOM) is detected and decoded to the same Chinese", () => {
  const bytes = readFixtureBytes("office-calendar-114-autumn-revised-big5.csv");
  const { text, encoding } = decodeCalendarBuffer(bytes);
  assert.equal(encoding, "big5");
  assert.ok(text.startsWith("西元日期,星期,是否放假,備註"));
  assert.ok(text.includes("孔子誕辰紀念日"));
  assert.ok(!text.includes("�"), "no replacement characters");
});

test("decodeCalendarBuffer: plain ASCII is UTF-8, and Big5 is never mistaken for UTF-8", () => {
  assert.equal(decodeCalendarBuffer(Buffer.from("abc")).encoding, "utf-8");
  assert.equal(decodeCalendarBuffer(readFixtureBytes("office-calendar-114-autumn-revised-big5.csv")).encoding, "big5");
});

// ------------------------------------------------------------------- parse --

test("parses the 114 winter slice (春節 + a Saturday 補班日): 28 days, holidays and the make-up day as published", () => {
  const rows = parseFixture("office-calendar-114-winter-utf8bom.csv");
  assert.equal(rows.length, 28);
  assert.equal(rows[0].date, "2025-01-20");
  assert.equal(rows.at(-1).date, "2025-02-16");

  const map = byDate(rows);
  // 小年夜, 除夕 and 春節 days are days off with their notes…
  assert.deepEqual(map.get("2025-01-28"), { date: "2025-01-28", isHoliday: true, note: "農曆除夕" });
  assert.deepEqual(map.get("2025-01-29"), { date: "2025-01-29", isHoliday: true, note: "春節" });
  assert.equal(map.get("2025-01-27").note, "小年夜");
  // …the Saturday 2025-02-08 is a working day (補行上班)…
  assert.deepEqual(map.get("2025-02-08"), { date: "2025-02-08", isHoliday: false, note: "補行上班" });
  // …and ordinary days carry no note.
  assert.deepEqual(map.get("2025-02-10"), { date: "2025-02-10", isHoliday: false, note: "" });
  assert.deepEqual(map.get("2025-02-09"), { date: "2025-02-09", isHoliday: true, note: "" });
});

test("parses the 115 excerpt: 國慶日 on a Saturday, 光復節 on a Sunday with its 補假 on Monday", () => {
  const map = byDate(parseFixture("office-calendar-115-excerpt-utf8bom.csv"));
  assert.deepEqual(map.get("2026-10-09"), { date: "2026-10-09", isHoliday: true, note: "補假" });
  assert.deepEqual(map.get("2026-10-10"), { date: "2026-10-10", isHoliday: true, note: "國慶日" });
  assert.equal(map.get("2026-10-25").note, "臺灣光復暨金門古寧頭大捷紀念日");
  assert.equal(map.get("2026-10-26").note, "補假");
  assert.equal(map.get("2026-12-25").note, "行憲紀念日");
});

test("parses the 116 excerpt (the year after 115) from its own file", () => {
  const rows = parseFixture("office-calendar-116-excerpt-utf8bom.csv");
  assert.equal(rows.length, 10);
  assert.deepEqual(rows[0], { date: "2027-01-01", isHoliday: true, note: "開國紀念日" });
});

test("a government revision overrides the original day by day: 2025-09-29 is a working day in the original file and a 補假 in the Big5 revision", () => {
  const original = byDate(parseFixture("office-calendar-114-autumn-original-utf8bom.csv"));
  const revised = byDate(parseFixture("office-calendar-114-autumn-revised-big5.csv"));
  assert.equal(original.size, 7);
  assert.equal(revised.size, 7);

  assert.equal(original.get("2025-09-29").isHoliday, false);
  assert.deepEqual(revised.get("2025-09-29"), { date: "2025-09-29", isHoliday: true, note: "補假" });
  // The revision also names days the original left blank.
  assert.equal(original.get("2025-09-28").note, "");
  assert.equal(revised.get("2025-09-28").note, "孔子誕辰紀念日");
  // Days both agree on are identical.
  assert.deepEqual(original.get("2025-09-26"), revised.get("2025-09-26"));
});

test("CRLF and LF line endings parse identically (a Windows checkout may rewrite the fixtures)", () => {
  const crlf = csv("20261010,六,2,國慶日", "20261012,一,0,");
  const lf = crlf.replace(/\r\n/g, "\n");
  assert.deepEqual(parseOfficeCalendarCsv(lf), parseOfficeCalendarCsv(crlf));
  assert.equal(parseOfficeCalendarCsv(crlf).length, 2);
});

test("blank trailing lines are ignored", () => {
  assert.equal(parseOfficeCalendarCsv(csv("20261012,一,0,") + "\r\n\r\n").length, 1);
});

// ----------------------------------------------------------- fail closed ----

const bad = (text, pattern) =>
  assert.throws(
    () => parseOfficeCalendarCsv(text),
    (error) => {
      assert.ok(error instanceof OfficeCalendarParseError, `expected OfficeCalendarParseError, got ${error}`);
      assert.match(error.message, pattern);
      return true;
    },
  );

test("an HTML error page served with HTTP 200 is refused, not parsed into nothing", () => {
  bad("<html><body>Service Unavailable</body></html>", /header/);
});

test("empty input and a header with no rows are refused", () => {
  bad("", /empty/i);
  bad(`${HEADER}\r\n`, /no day rows/);
});

test("a wrong or reordered header is refused (the columns may have shifted)", () => {
  bad("日期,星期,是否放假,備註\r\n20261010,六,2,國慶日\r\n", /header/);
  bad("星期,西元日期,是否放假,備註\r\n20261010,六,2,國慶日\r\n", /header/);
});

test("a date that is not eight digits, or not a real date, is refused", () => {
  bad(csv("2026-10-10,六,2,國慶日"), /YYYYMMDD/);
  bad(csv("20260230,一,0,"), /real calendar date/);
  bad(csv("20261310,一,0,"), /real calendar date/);
});

test("a weekday label that disagrees with the date is refused (column-shift guard)", () => {
  bad(csv("20261010,一,2,國慶日"), /Saturday|六/);
});

test("a 是否放假 flag other than 0 or 2 is refused rather than guessed", () => {
  bad(csv("20261010,六,1,國慶日"), /neither 0 nor 2/);
  bad(csv("20261010,六,,國慶日"), /neither 0 nor 2/);
});

test("a repeated date is refused", () => {
  bad(csv("20261012,一,0,", "20261012,一,0,"), /more than once/);
});

// ------------------------------------------------------ whole-year guard -----

/** A synthetic but structurally real year: Mon-Fri work, Sat-Sun off. */
const syntheticYear = (year) => {
  const days = [];
  for (let date = `${year}-01-01`; date <= `${year}-12-31`; date = addDays(date, 1)) {
    const weekday = weekdayOf(date);
    days.push({ date, isHoliday: weekday === 0 || weekday === 6, note: "" });
  }
  return days;
};

test("assertFullCalendarYear accepts a complete 365-day and a complete 366-day year", () => {
  assert.doesNotThrow(() => assertFullCalendarYear(syntheticYear(2027), 2027));
  assert.equal(syntheticYear(2028).length, 366);
  assert.doesNotThrow(() => assertFullCalendarYear(syntheticYear(2028), 2028));
});

test("assertFullCalendarYear refuses a truncated file, a missing day, the wrong year and a repeated day", () => {
  const year = syntheticYear(2027);
  assert.throws(() => assertFullCalendarYear(year.slice(0, 200), 2027), /expected 365/);
  assert.throws(() => assertFullCalendarYear(year.filter((d) => d.date !== "2027-06-15"), 2027), /expected 365/);
  assert.throws(() => assertFullCalendarYear(year, 2026), /outside that year/);
  const repeated = [...year.slice(0, 364), year[10]];
  assert.throws(() => assertFullCalendarYear(repeated, 2027), /repeats a date/);
  assert.throws(() => assertFullCalendarYear(syntheticYear(2027).slice(1).concat(syntheticYear(2028).slice(0, 1)), 2027), /outside that year/);
});

test("the weekday labels the parser expects are Sunday-first (日一二三四五六)", () => {
  assert.deepEqual([...WEEKDAY_LABELS_ZH], ["日", "一", "二", "三", "四", "五", "六"]);
});
