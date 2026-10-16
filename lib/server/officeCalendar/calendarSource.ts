/**
 * Where the calendar rows for a request come from (issue #691): the synced
 * table first, the committed seed second, nothing third.
 *
 * - `db`:    every date of the window came from office_calendar_days.
 * - `mixed`: the table has some of the window; the seed filled the rest (e.g.
 *            next year's file was not synced yet).
 * - `seed`:  the table is empty or unreachable; everything is from the seed.
 * - `none`:  neither has the window. The answer is then `unknown`, never a
 *            guess from the weekday.
 *
 * The seed (data/office-calendar-seed.json) is a real copy of the official
 * 2026 and 2027 files with the date it was taken, so it is honest data with an
 * age, not a placeholder. The table always wins for a date it has: a
 * government correction synced later overrides the seed.
 */
import fs from "node:fs";
import path from "node:path";
import { addDays, isValidIsoDate, taipeiDateOf, type IsoDate, type OfficeCalendarDay } from "../../tools/workSchoolStatus/calendar";
import type { CalendarDataSource } from "../../tools/workSchoolStatus/apiTypes";

export type { CalendarDataSource };

export interface OfficeCalendarSeed {
  source: string;
  retrievedAt: string;
  days: Record<IsoDate, [number, string]>;
}

export interface CalendarWindow {
  rows: OfficeCalendarDay[];
  from: IsoDate;
  to: IsoDate;
  source: CalendarDataSource;
  /** True whenever the table alone did not answer (seed used, table failed or empty). */
  degraded: boolean;
  /** Newest sync time of the table (ISO 8601 UTC); null if the table was unreachable or empty. */
  syncedAt: string | null;
  /** When the seed copy was taken, if the seed contributed any date. */
  seedRetrievedAt: string | null;
  dbError: string | null;
}

/** A window long enough to cover "yesterday" (clients behind the cache) through today + 60 days + 1 day of slack. */
export const WINDOW_DAYS_BEFORE = 1;
export const WINDOW_DAYS_AFTER = 62;

let cachedSeed: OfficeCalendarSeed | null | undefined;

export const readOfficeCalendarSeed = (): OfficeCalendarSeed | null => {
  if (cachedSeed !== undefined) return cachedSeed;
  let seed: OfficeCalendarSeed | null = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "office-calendar-seed.json"), "utf-8"));
    seed = parsed && typeof parsed === "object" && parsed.days && typeof parsed.days === "object" ? parsed : null;
  } catch (error) {
    console.warn("[officeCalendar] Could not read data/office-calendar-seed.json:", error);
  }
  cachedSeed = seed;
  return seed;
};

const seedRowsInRange = (seed: OfficeCalendarSeed | null, from: IsoDate, to: IsoDate): OfficeCalendarDay[] => {
  if (!seed) return [];
  const rows: OfficeCalendarDay[] = [];
  for (const [date, entry] of Object.entries(seed.days)) {
    if (!isValidIsoDate(date) || date < from || date > to || !Array.isArray(entry)) continue;
    rows.push({ date, isHoliday: Number(entry[0]) === 2, note: typeof entry[1] === "string" ? entry[1] : "" });
  }
  return rows.sort((a, b) => (a.date < b.date ? -1 : 1));
};

/** Table rows win; the seed only fills dates the table does not have. */
export const mergeCalendarRows = (
  dbRows: readonly OfficeCalendarDay[],
  seedRows: readonly OfficeCalendarDay[],
): { rows: OfficeCalendarDay[]; fromDb: number; fromSeed: number } => {
  const byDate = new Map<IsoDate, OfficeCalendarDay>();
  for (const row of seedRows) byDate.set(row.date, row);
  const dbDates = new Set<IsoDate>();
  for (const row of dbRows) {
    byDate.set(row.date, row);
    dbDates.add(row.date);
  }
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const fromDb = rows.filter((row) => dbDates.has(row.date)).length;
  return { rows, fromDb, fromSeed: rows.length - fromDb };
};

export interface CalendarSourceDeps {
  getRows: (from: IsoDate, to: IsoDate) => Promise<OfficeCalendarDay[]>;
  getSyncedAt: () => Promise<string | null>;
  readSeed: () => OfficeCalendarSeed | null;
  now: () => Date;
  /** How long the table may take before the seed answers instead. */
  dbTimeoutMs: number;
}

const withTimeout = <T>(work: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`office_calendar_days read timed out after ${ms}ms`)), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const defaultDeps = (): CalendarSourceDeps => ({
  getRows: async (from, to) => (await import("./queries")).getOfficeCalendarRows(from, to),
  getSyncedAt: async () => (await (await import("./queries")).getOfficeCalendarTableMeta()).syncedAt,
  readSeed: readOfficeCalendarSeed,
  now: () => new Date(),
  dbTimeoutMs: 4000,
});

export const loadCalendarWindow = async (overrides: Partial<CalendarSourceDeps> = {}): Promise<CalendarWindow> => {
  const deps = { ...defaultDeps(), ...overrides };
  const today = taipeiDateOf(deps.now());
  const from = addDays(today, -WINDOW_DAYS_BEFORE);
  const to = addDays(today, WINDOW_DAYS_AFTER);

  let dbRows: OfficeCalendarDay[] = [];
  let syncedAt: string | null = null;
  let dbError: string | null = null;
  try {
    // A hung database must degrade to the seed in seconds, not hold the page.
    const read = async () => {
      const rows = await deps.getRows(from, to);
      return { rows, syncedAt: rows.length > 0 ? await deps.getSyncedAt() : null };
    };
    const result = await withTimeout(read(), deps.dbTimeoutMs);
    dbRows = result.rows;
    syncedAt = result.syncedAt;
  } catch (error) {
    dbRows = [];
    dbError = error instanceof Error ? error.message : String(error);
  }

  const seed = deps.readSeed();
  const merged = mergeCalendarRows(dbRows, seedRowsInRange(seed, from, to));

  let source: CalendarDataSource;
  if (merged.rows.length === 0) source = "none";
  else if (merged.fromSeed === 0) source = "db";
  else if (merged.fromDb === 0) source = "seed";
  else source = "mixed";

  return {
    rows: merged.rows,
    from,
    to,
    source,
    degraded: source !== "db",
    syncedAt,
    seedRetrievedAt: merged.fromSeed > 0 && seed ? seed.retrievedAt : null,
    dbError,
  };
};
