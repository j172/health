/**
 * The decision logic of the office-calendar sync (issue #691), separated from
 * the network and the database so it can be tested with plain fakes: which
 * years to fetch, which resource to use, what counts as a failed year, and
 * what is allowed to reach the table.
 *
 * Rules, each pinned by syncCore.test.mjs:
 * - Years synced: this year and next (Asia/Taipei). The current year is
 *   required; next year's file is normally published around July, so its
 *   absence earlier in the year is "not yet", not an error.
 * - A year is written only if its file parses cleanly AND is a complete year
 *   (365/366 rows, none from another year). Anything else leaves that year's
 *   rows exactly as they were and is reported, never partially applied.
 * - Years are independent: a broken 2027 file does not stop 2026 from being
 *   refreshed.
 * - Writes are an upsert keyed by calendar date, so a re-run adds nothing and a
 *   government correction (the 114 revision of October 2025 changed three
 *   days) updates the existing rows in place. Rows are never deleted.
 */
import { taipeiDateOf, type OfficeCalendarDay } from "../../tools/workSchoolStatus/calendar";
import { assertFullCalendarYear, decodeCalendarBuffer, parseOfficeCalendarCsv } from "./parseOfficeCalendarCsv";
import { resolveCalendarResources, type CalendarResource } from "./datasetResources";

export interface OfficeCalendarSyncDeps {
  fetchMetadata: () => Promise<unknown>;
  fetchCsv: (url: string) => Promise<Uint8Array>;
  upsertYear: (year: number, days: OfficeCalendarDay[]) => Promise<{ inserted: number; updated: number }>;
  now: () => Date;
}

export interface OfficeCalendarYearResult {
  year: number;
  /** `ok` = written; `not-published` = next year's file is not listed yet (fine); `failed` = see `error`. */
  status: "ok" | "not-published" | "failed";
  resource: string | null;
  rows: number;
  inserted: number;
  updated: number;
  error: string | null;
}

export interface OfficeCalendarSyncResult {
  years: OfficeCalendarYearResult[];
  /** Set when even the metadata could not be read; no year was attempted. */
  error: string | null;
}

const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** This year and next year, by the Asia/Taipei calendar. */
export const planCalendarYears = (now: Date): number[] => {
  const year = Number(taipeiDateOf(now).slice(0, 4));
  return [year, year + 1];
};

export const syncOfficeCalendar = async (deps: OfficeCalendarSyncDeps): Promise<OfficeCalendarSyncResult> => {
  const [currentYear, ...laterYears] = planCalendarYears(deps.now());

  let resources: Map<number, CalendarResource>;
  try {
    resources = resolveCalendarResources(await deps.fetchMetadata(), [currentYear, ...laterYears]);
  } catch (error) {
    return { years: [], error: `Could not read the data.gov.tw 14718 metadata: ${errorMessage(error)}` };
  }

  const years: OfficeCalendarYearResult[] = [];

  for (const year of [currentYear, ...laterYears]) {
    const resource = resources.get(year);
    if (!resource) {
      years.push({
        year,
        status: year === currentYear ? "failed" : "not-published",
        resource: null,
        rows: 0,
        inserted: 0,
        updated: 0,
        error: year === currentYear ? `data.gov.tw 14718 lists no calendar file for ${year}` : null,
      });
      continue;
    }

    try {
      const { text } = decodeCalendarBuffer(await deps.fetchCsv(resource.url));
      const days = parseOfficeCalendarCsv(text);
      assertFullCalendarYear(days, year);
      const { inserted, updated } = await deps.upsertYear(year, days);
      years.push({ year, status: "ok", resource: resource.description, rows: days.length, inserted, updated, error: null });
    } catch (error) {
      years.push({
        year,
        status: "failed",
        resource: resource.description,
        rows: 0,
        inserted: 0,
        updated: 0,
        error: errorMessage(error),
      });
    }
  }

  return { years, error: null };
};
