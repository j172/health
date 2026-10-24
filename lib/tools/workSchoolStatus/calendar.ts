/**
 * Pure date + office-calendar logic for 「今天要上班上課嗎？」 (issue #691).
 *
 * Source of the rows: 行政院人事行政總處《中華民國政府行政機關辦公日曆表》 (data.gov.tw
 * 14718). Each row is one calendar day with the file's own 「是否放假」 flag
 * (0 = a working day, 2 = a day off) and 「備註」 (the holiday name, 「補假」, or
 * 「補行上班」 on a make-up working day that falls on a weekend).
 *
 * Deliberately free of imports, `Date` local-time accessors and anything
 * server-only, so the exact same functions run in the API route, in the
 * homepage status bar (client) and in the tests:
 *
 * - "Today" / "tomorrow" are the calendar dates in Asia/Taipei, derived from a
 *   UTC instant plus Taiwan's fixed +08:00 offset (Taiwan has had no DST since
 *   1979). Nothing here reads the host's time zone, so a server running in UTC
 *   (this site's production host) and a developer machine in any other zone
 *   give the same answer for the same instant.
 * - A date the data does not cover is reported as `unknown`. It is never
 *   guessed from the weekday: a missing row on a Saturday could be a 補班日.
 */

export const OFFICE_CALENDAR_TIME_ZONE = "Asia/Taipei";

/** Taiwan Standard Time, +08:00 all year round. */
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Default look-ahead for the holiday list: today + 60 days (issue #691 decision 2). */
export const UPCOMING_WINDOW_DAYS = 60;

/** `YYYY-MM-DD`, always a real calendar date. */
export type IsoDate = string;

/** One row of the official calendar. */
export interface OfficeCalendarDay {
  date: IsoDate;
  /** The file's 是否放假: true = day off (2), false = working day (0). */
  isHoliday: boolean;
  /** 備註 as published (e.g. 國慶日, 補假, 補行上班); empty when the file has none. */
  note: string;
}

export type DayState =
  /** A Monday-Friday working day. */
  | "workday"
  /** A weekend day that is a working day anyway (補班日 / 補行上班). */
  | "makeup-workday"
  /** A day off: weekend, national holiday or 補假. */
  | "off"
  /** The data has no row for this date. */
  | "unknown";

export interface DayStatus {
  date: IsoDate;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  state: DayState;
  /** Only for `off`: a plain weekend, or a named holiday / 補假 (also any weekday off). */
  offReason: "weekend" | "holiday" | null;
  /** The official 備註 (holiday name, 補假, 補行上班); null when there is none. */
  name: string | null;
}

export interface UpcomingDay {
  date: IsoDate;
  weekday: number;
  /** `holiday` = a named holiday, 補假 or any weekday off; `makeup-workday` = 補班日. */
  kind: "holiday" | "makeup-workday";
  name: string | null;
}

export interface WorkdayAnswer {
  /** The Asia/Taipei calendar date the answer was computed for. */
  asOf: IsoDate;
  today: DayStatus;
  tomorrow: DayStatus;
  /** Holidays (named days, 補假) and 補班日 from today through today + windowDays, oldest first. Plain weekends are not listed. */
  upcoming: UpcomingDay[];
  windowFrom: IsoDate;
  windowTo: IsoDate;
  /** First / last date the data covers (null when it has no rows at all). */
  coveredFrom: IsoDate | null;
  coveredTo: IsoDate | null;
  /** True when the data stops (or is missing) before `windowTo`, so the list may be incomplete. */
  windowTruncated: boolean;
}

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const toUtcMs = (date: IsoDate): number => {
  const match = ISO_DATE_PATTERN.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${JSON.stringify(date)}`);
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const fromUtcMs = (ms: number): IsoDate => new Date(ms).toISOString().slice(0, 10);

/** True for a real calendar date written `YYYY-MM-DD` (rejects 2025-02-30, 2025-13-01, 2025-2-3). */
export const isValidIsoDate = (value: unknown): value is IsoDate => {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return fromUtcMs(ms) === value;
};

/** The Asia/Taipei calendar date of an instant (epoch ms or Date). */
export const taipeiDateOf = (now: Date | number): IsoDate => {
  const ms = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(ms)) throw new Error("taipeiDateOf needs a finite instant");
  return fromUtcMs(ms + TAIPEI_OFFSET_MS);
};

export const addDays = (date: IsoDate, days: number): IsoDate => fromUtcMs(toUtcMs(date) + days * DAY_MS);

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: IsoDate, to: IsoDate): number => Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);

/** 0 = Sunday … 6 = Saturday, for a calendar date (no time zone involved). */
export const weekdayOf = (date: IsoDate): number => new Date(toUtcMs(date)).getUTCDay();

export const WEEKDAY_LABELS_ZH = ["日", "一", "二", "三", "四", "五", "六"] as const;

const isWeekend = (weekday: number): boolean => weekday === 0 || weekday === 6;

export const classifyDay = (date: IsoDate, row: OfficeCalendarDay | undefined): DayStatus => {
  const weekday = weekdayOf(date);
  if (!row) return { date, weekday, state: "unknown", offReason: null, name: null };

  const name = row.note.trim() || null;
  if (row.isHoliday) {
    // A weekend day with no 備註 is just the weekend; anything named (or any
    // weekday off, even if the file forgot to name it) is a holiday.
    const offReason = isWeekend(weekday) && name === null ? "weekend" : "holiday";
    return { date, weekday, state: "off", offReason, name };
  }
  return { date, weekday, state: isWeekend(weekday) ? "makeup-workday" : "workday", offReason: null, name };
};

const indexByDate = (rows: readonly OfficeCalendarDay[]): Map<IsoDate, OfficeCalendarDay> => {
  const byDate = new Map<IsoDate, OfficeCalendarDay>();
  for (const row of rows) byDate.set(row.date, row);
  return byDate;
};

/**
 * The full answer for an instant: today, tomorrow, and the holidays / 補班日
 * in the next `windowDays` days. `rows` may be any superset of the data.
 */
export const buildWorkdayAnswer = (
  rows: readonly OfficeCalendarDay[],
  now: Date | number,
  options: { windowDays?: number } = {},
): WorkdayAnswer => {
  const windowDays = options.windowDays ?? UPCOMING_WINDOW_DAYS;
  const asOf = taipeiDateOf(now);
  const byDate = indexByDate(rows);

  const today = classifyDay(asOf, byDate.get(asOf));
  const tomorrowDate = addDays(asOf, 1);
  const tomorrow = classifyDay(tomorrowDate, byDate.get(tomorrowDate));

  const windowTo = addDays(asOf, windowDays);
  const upcoming: UpcomingDay[] = [];
  for (let offset = 0; offset <= windowDays; offset += 1) {
    const date = addDays(asOf, offset);
    const status = classifyDay(date, byDate.get(date));
    if (status.state === "makeup-workday") {
      upcoming.push({ date, weekday: status.weekday, kind: "makeup-workday", name: status.name });
    } else if (status.state === "off" && status.offReason === "holiday") {
      upcoming.push({ date, weekday: status.weekday, kind: "holiday", name: status.name });
    }
  }

  let coveredFrom: IsoDate | null = null;
  let coveredTo: IsoDate | null = null;
  for (const row of rows) {
    if (coveredFrom === null || row.date < coveredFrom) coveredFrom = row.date;
    if (coveredTo === null || row.date > coveredTo) coveredTo = row.date;
  }

  // The list is only complete when every date of the window has a row. Checking
  // the end alone would hide a hole in the middle (e.g. a missing year file).
  let windowTruncated = false;
  for (let offset = 0; offset <= windowDays; offset += 1) {
    if (!byDate.has(addDays(asOf, offset))) {
      windowTruncated = true;
      break;
    }
  }

  return { asOf, today, tomorrow, upcoming, windowFrom: asOf, windowTo, coveredFrom, coveredTo, windowTruncated };
};

/**
 * What the homepage status bar needs for one calendar day (今天 or 明天):
 * just the classified day state, nothing typhoon-related — a CWA typhoon
 * warning is surfaced elsewhere (the site-wide TyphoonBanner, issue #744;
 * and /tools/work-school-status's own ClosureGuidanceSection), never by this
 * chip. `now` is any instant; pass it +24h to resolve 明天 instead of 今天.
 */
export interface HomeWorkdayChip {
  state: DayState;
  offReason: DayStatus["offReason"];
  name: string | null;
}

export const buildHomeWorkdayChip = (rows: readonly OfficeCalendarDay[], now: Date | number): HomeWorkdayChip => {
  const date = taipeiDateOf(now);
  const status = classifyDay(date, indexByDate(rows).get(date));
  return { state: status.state, offReason: status.offReason, name: status.name };
};

export type HomeHolidayMode =
  | "workday-countdown" // Weekday > 1 day to holiday
  | "tomorrow-off"      // Weekday exactly 1 day to holiday
  | "today-off"         // Today is a day off (weekend or national holiday)
  | "makeup-workday"    // Today is Saturday make-up workday
  | "unknown";          // Missing calendar coverage

export interface HomeNextHolidayChip {
  mode: HomeHolidayMode;
  emoji: "🏢" | "🏖️";
  labelKey: string;
  defaultLabel: string;
  daysUntil?: number;
  targetName?: string | null;
  todayReason?: "weekend" | "holiday" | null;
  todayName?: string | null;
}

export const buildHomeNextHolidayChip = (
  rows: readonly OfficeCalendarDay[],
  now: Date | number,
): HomeNextHolidayChip => {
  const today = taipeiDateOf(now);
  const byDate = indexByDate(rows);
  const todayStatus = classifyDay(today, byDate.get(today));

  if (todayStatus.state === "unknown") {
    return {
      mode: "unknown",
      emoji: "🏢",
      labelKey: "homePage.statusBar.nextHolidayLabel",
      defaultLabel: "下個假日",
    };
  }

  if (todayStatus.state === "makeup-workday") {
    return {
      mode: "makeup-workday",
      emoji: "🏢",
      labelKey: "homePage.statusBar.workdayWorkdayLabel",
      defaultLabel: "今日上班",
    };
  }

  if (todayStatus.state === "off") {
    return {
      mode: "today-off",
      emoji: "🏖️",
      labelKey: "homePage.statusBar.todayOffLabel",
      defaultLabel: "今日放假",
      todayReason: todayStatus.offReason,
      todayName: todayStatus.name,
    };
  }

  // todayStatus.state === "workday"
  let targetStatus: DayStatus | null = null;
  for (let offset = 1; offset <= UPCOMING_WINDOW_DAYS; offset += 1) {
    const nextDate = addDays(today, offset);
    const row = byDate.get(nextDate);
    if (!row) {
      break;
    }
    const status = classifyDay(nextDate, row);
    if (status.state === "off") {
      targetStatus = status;
      break;
    }
  }

  if (!targetStatus) {
    return {
      mode: "unknown",
      emoji: "🏢",
      labelKey: "homePage.statusBar.nextHolidayLabel",
      defaultLabel: "下個假日",
    };
  }

  const daysUntil = daysBetween(today, targetStatus.date);
  const targetName =
    targetStatus.name ??
    (targetStatus.offReason === "weekend"
      ? (WEEKDAY_LABELS_ZH[targetStatus.weekday] ? `週${WEEKDAY_LABELS_ZH[targetStatus.weekday]}` : "週六")
      : null);

  if (daysUntil === 1) {
    return {
      mode: "tomorrow-off",
      emoji: "🏢",
      labelKey: "homePage.statusBar.nextHolidayLabel",
      defaultLabel: "下個假日",
      daysUntil: 1,
      targetName,
    };
  }

  return {
    mode: "workday-countdown",
    emoji: "🏢",
    labelKey: "homePage.statusBar.nextHolidayLabel",
    defaultLabel: "下個假日",
    daysUntil,
    targetName,
  };
};
