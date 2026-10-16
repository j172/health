import { addDays, taipeiDateOf, type OfficeCalendarDay } from "@/lib/tools/workSchoolStatus/calendar";
import { loadCalendarWindow, type CalendarDataSource } from "./calendarSource";
import { isTyphoonWarningActive } from "./typhoonWarning";

/**
 * The 「今日上班」 section of the homepage status bar (issue #691) — one more
 * entry in /api/home-status's single aggregation, so the bar still costs one
 * request.
 *
 * It returns a few days of rows (yesterday through two days ahead), not a
 * finished sentence: /api/home-status is edge-cached for minutes
 * (`s-maxage=180, stale-while-revalidate=600`), and a cached "today is a
 * workday" served after midnight would be wrong. The status bar resolves
 * today from these rows with the visitor's own clock via the same pure
 * function the API uses (buildHomeWorkdayChip).
 */
export interface HomeStatusWorkday {
  days: OfficeCalendarDay[];
  source: CalendarDataSource;
  /** A CWA typhoon warning is in force — a prompt to read the official 停班停課 page, not a closure. */
  typhoonWarning: boolean;
}

export const fetchHomeStatusWorkday = async (): Promise<HomeStatusWorkday> => {
  const now = new Date();
  const [window, typhoonWarning] = await Promise.all([loadCalendarWindow({ now: () => now }), isTyphoonWarningActive()]);
  const today = taipeiDateOf(now);
  const from = addDays(today, -1);
  const to = addDays(today, 2);
  return {
    days: window.rows.filter((row) => row.date >= from && row.date <= to),
    source: window.source,
    typhoonWarning: typhoonWarning === true,
  };
};
