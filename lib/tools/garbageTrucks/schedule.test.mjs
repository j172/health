// Issue #674 (B-16): pure helpers shared by the garbage-route parsers (server)
// and the route list UI (client) — weekday bitmask <-> labels and the
// HHMM/H:MM clock strings the two source datasets use.
import test from "node:test";
import assert from "node:assert/strict";
import {
  WEEKDAY_BITS,
  weekdayMaskFromFlags,
  weekdaysFromMask,
  formatWeekdays,
  normalizeClock,
  formatClock,
} from "./schedule.ts";

test("weekdayMaskFromFlags: bit 0 is Sunday (same index as Date#getDay), bit 6 is Saturday", () => {
  assert.equal(WEEKDAY_BITS.length, 7);
  assert.equal(weekdayMaskFromFlags([true, false, false, false, false, false, false]), 1);
  assert.equal(weekdayMaskFromFlags([false, false, false, false, false, false, true]), 64);
  // Mon, Tue, Thu, Fri, Sat — the first row of New Taipei's 207001 route.
  assert.equal(weekdayMaskFromFlags([false, true, true, false, true, true, true]), 2 + 4 + 16 + 32 + 64);
  assert.equal(weekdayMaskFromFlags([false, false, false, false, false, false, false]), 0);
  assert.equal(weekdayMaskFromFlags([true, true, true, true, true, true, true]), 127);
});

test("weekdaysFromMask: inverse of weekdayMaskFromFlags, ascending Sunday..Saturday", () => {
  assert.deepEqual(weekdaysFromMask(118), [1, 2, 4, 5, 6]);
  assert.deepEqual(weekdaysFromMask(0), []);
  assert.deepEqual(weekdaysFromMask(127), [0, 1, 2, 3, 4, 5, 6]);
});

test("formatWeekdays: null means the source gives no weekday info (Taipei), 0 means no collection that kind", () => {
  assert.equal(formatWeekdays(null), null);
  assert.equal(formatWeekdays(0), "未排定");
  assert.equal(formatWeekdays(127), "每日");
  assert.equal(formatWeekdays(118), "週一、週二、週四、週五、週六");
  assert.equal(formatWeekdays(16), "週四");
});

test("normalizeClock: Taipei's compact HHMM and New Taipei's H:MM both become zero-padded HH:MM", () => {
  assert.equal(normalizeClock("1630"), "16:30");
  assert.equal(normalizeClock("0905"), "09:05");
  assert.equal(normalizeClock("905"), "09:05");
  assert.equal(normalizeClock("12:40"), "12:40");
  assert.equal(normalizeClock("9:05"), "09:05");
});

test("normalizeClock: a trip that runs past midnight keeps its hour >= 24 instead of being dropped (Taipei 文林-2 第3車 arrives at 2417)", () => {
  assert.equal(normalizeClock("2417"), "24:17");
});

test("normalizeClock: garbage in, null out — never throws", () => {
  assert.equal(normalizeClock(""), null);
  assert.equal(normalizeClock(undefined), null);
  assert.equal(normalizeClock(null), null);
  assert.equal(normalizeClock("abc"), null);
  assert.equal(normalizeClock("1699"), null, "minutes must be < 60");
  assert.equal(normalizeClock("9999"), null, "hours past 29 are not a service-day clock");
});

test("formatClock: normal times pass through, hour >= 24 is shown as next-day so readers do not misread 24:17", () => {
  assert.equal(formatClock("16:30"), "16:30");
  assert.equal(formatClock("24:17"), "次日 00:17");
  assert.equal(formatClock("25:05"), "次日 01:05");
  assert.equal(formatClock(null), "—");
});
