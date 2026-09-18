import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTaipeiDateToUtc, parseRfc822ToDate } from "./time.ts";

test("parseTaipeiDateToUtc: parses YYYY-MM-DD HH:mm:ss correctly", () => {
  const parsed = parseTaipeiDateToUtc("2026-09-18 14:30:00");
  assert.ok(parsed instanceof Date);
  // Taipei 14:30 is UTC 06:30
  assert.equal(parsed.toISOString(), "2026-09-18T06:30:00.000Z");
});

test("parseTaipeiDateToUtc: parses YYYY-MM-DD (no time) defaulting to 00:00:00 Taipei time", () => {
  const parsed = parseTaipeiDateToUtc("2026-09-18");
  assert.ok(parsed instanceof Date);
  // Taipei 00:00 is UTC 16:00 previous day
  assert.equal(parsed.toISOString(), "2026-09-17T16:00:00.000Z");
});

test("parseTaipeiDateToUtc: parses YYYY-MM-DD HH:mm (seconds omitted)", () => {
  const parsed = parseTaipeiDateToUtc("2026-09-18 08:00");
  assert.ok(parsed instanceof Date);
  assert.equal(parsed.toISOString(), "2026-09-18T00:00:00.000Z");
});

test("parseTaipeiDateToUtc: handles invalid inputs gracefully", () => {
  assert.equal(parseTaipeiDateToUtc(null), null);
  assert.equal(parseTaipeiDateToUtc(""), null);
  assert.equal(parseTaipeiDateToUtc("invalid-date"), null);
});

test("parseRfc822ToDate: parses standard RFC822 strings", () => {
  const parsed = parseRfc822ToDate("Wed, 16 Sep 2026 14:00:00 +0800");
  assert.ok(parsed instanceof Date);
  assert.equal(parsed.toISOString(), "2026-09-16T06:00:00.000Z");
});
