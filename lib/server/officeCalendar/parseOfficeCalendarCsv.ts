/**
 * Parser for the yearly CSV files of data.gov.tw 14718 《中華民國政府行政機關辦公日曆表》
 * (行政院人事行政總處; issue #691).
 *
 * Live shape, verified 2026-10-16 against the 114 / 115 / 116 files: header
 * `西元日期,星期,是否放假,備註`, one row per calendar day (`20261010,六,2,國慶日`),
 * 是否放假 is `0` (working day) or `2` (day off), 備註 is empty on an ordinary
 * day. A 補班日 is a Saturday/Sunday with 是否放假 = 0 and 備註 `補行上班`. CRLF line
 * endings. Most files are UTF-8 with a BOM, but the 114 revision published
 * 2025-10-20 (「1141020更新」) is Big5 without one — so the decoder sniffs rather
 * than trusting a fixed encoding.
 *
 * This parser fails closed: any header, date, weekday or flag it does not
 * recognise throws instead of being skipped. A file that is partly understood
 * is a file whose answer ("is tomorrow a working day?") cannot be trusted, and
 * a thrown error leaves the stored calendar untouched.
 *
 * Imports are relative and there is nothing server-only in here, so it runs
 * under plain `node --test` and in scripts.
 */
import { isValidIsoDate, weekdayOf, WEEKDAY_LABELS_ZH, type OfficeCalendarDay } from "../../tools/workSchoolStatus/calendar";
import { tokenizeWraCsv } from "../water/wraCsvParser";

export class OfficeCalendarParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OfficeCalendarParseError";
  }
}

export const OFFICE_CALENDAR_CSV_HEADER = ["西元日期", "星期", "是否放假", "備註"] as const;

/**
 * Bytes -> text. A UTF-8 BOM, or any byte sequence that is valid UTF-8, is
 * decoded as UTF-8; anything else is Big5 (what the 114 revision is).
 */
export const decodeCalendarBuffer = (buffer: Uint8Array): { text: string; encoding: "utf-8" | "big5" } => {
  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "utf-8" };
  } catch {
    return { text: new TextDecoder("big5").decode(buffer), encoding: "big5" };
  }
};

const compactToIso = (compact: string): string => `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;

/** CSV text -> one row per calendar day, in file order. Throws OfficeCalendarParseError on anything unexpected. */
export const parseOfficeCalendarCsv = (text: string): OfficeCalendarDay[] => {
  const rows = tokenizeWraCsv(text).filter((cells) => cells.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) throw new OfficeCalendarParseError("Office calendar CSV is empty");

  const header = rows[0].slice(0, OFFICE_CALENDAR_CSV_HEADER.length).map((cell) => cell.trim());
  if (header.length !== OFFICE_CALENDAR_CSV_HEADER.length || header.some((cell, i) => cell !== OFFICE_CALENDAR_CSV_HEADER[i])) {
    throw new OfficeCalendarParseError(
      `Office calendar CSV header is not ${OFFICE_CALENDAR_CSV_HEADER.join(",")}: ${JSON.stringify(rows[0].slice(0, 6))}`,
    );
  }

  const days: OfficeCalendarDay[] = [];
  const seen = new Set<string>();

  rows.slice(1).forEach((cells, index) => {
    const line = index + 2;
    const [compactDate = "", weekdayLabel = "", flag = "", note = ""] = cells.map((cell) => cell.trim());

    if (!/^\d{8}$/.test(compactDate)) {
      throw new OfficeCalendarParseError(`Line ${line}: 西元日期 ${JSON.stringify(compactDate)} is not YYYYMMDD`);
    }
    const date = compactToIso(compactDate);
    if (!isValidIsoDate(date)) {
      throw new OfficeCalendarParseError(`Line ${line}: ${compactDate} is not a real calendar date`);
    }
    if (seen.has(date)) {
      throw new OfficeCalendarParseError(`Line ${line}: ${date} appears more than once`);
    }
    seen.add(date);

    // The 星期 column is a free cross-check that the columns have not shifted.
    const expectedWeekday = WEEKDAY_LABELS_ZH[weekdayOf(date)];
    if (weekdayLabel !== expectedWeekday) {
      throw new OfficeCalendarParseError(`Line ${line}: ${date} is a ${expectedWeekday}, the file says ${JSON.stringify(weekdayLabel)}`);
    }

    if (flag !== "0" && flag !== "2") {
      throw new OfficeCalendarParseError(`Line ${line}: 是否放假 ${JSON.stringify(flag)} is neither 0 nor 2`);
    }

    days.push({ date, isHoliday: flag === "2", note });
  });

  if (days.length === 0) throw new OfficeCalendarParseError("Office calendar CSV has a header but no day rows");
  return days;
};

/**
 * A yearly file must hold every day of its year exactly once — 365 or 366 rows,
 * none from another year. A truncated download or the wrong year's file is
 * refused before anything is written, so a bad file can never leave a hole in
 * the stored calendar.
 */
export const assertFullCalendarYear = (days: readonly OfficeCalendarDay[], year: number): void => {
  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const expected = isValidIsoDate(`${year}-02-29`) ? 366 : 365;

  const outside = days.find((day) => day.date < first || day.date > last);
  if (outside) {
    throw new OfficeCalendarParseError(`Calendar for ${year} contains ${outside.date}, which is outside that year`);
  }
  if (days.length !== expected) {
    throw new OfficeCalendarParseError(`Calendar for ${year} has ${days.length} days, expected ${expected}`);
  }
  // All inside the year + the right count + no repeats = every day present.
  if (new Set(days.map((day) => day.date)).size !== expected) {
    throw new OfficeCalendarParseError(`Calendar for ${year} repeats a date, so some days are missing`);
  }
};
