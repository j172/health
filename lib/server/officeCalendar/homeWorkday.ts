import { addDays, taipeiDateOf, type OfficeCalendarDay } from "@/lib/tools/workSchoolStatus/calendar";
import { loadCalendarWindow, type CalendarDataSource } from "./calendarSource";

/**
 * The 「今天上班上課／明日上班」 sections of the homepage status bar (issue #691,
 * follow-up home-alerts-severity-and-workday-tomorrow) — one more entry in
 * /api/home-status's single aggregation, so the bar still costs one request.
 *
 * It returns a few days of rows (yesterday through two days ahead, which
 * already covers "tomorrow"), not a finished sentence: /api/home-status is
 * edge-cached for minutes (`s-maxage=180, stale-while-revalidate=600`), and a
 * cached "today is a workday" served after midnight would be wrong. The
 * status bar resolves today/tomorrow from these rows with the visitor's own
 * clock via the same pure function the API uses (buildHomeWorkdayChip).
 *
 * This no longer carries a CWA typhoon-warning flag: the homepage pills only
 * ever reflect the office calendar now (a typhoon warning is surfaced
 * elsewhere — the site-wide TyphoonBanner, issue #744 — not here).
 */
export interface HomeStatusWorkday {
  days: OfficeCalendarDay[];
  source: CalendarDataSource;
}

export const fetchHomeStatusWorkday = async (): Promise<HomeStatusWorkday> => {
  const now = new Date();
  const window = await loadCalendarWindow({ now: () => now });
  const today = taipeiDateOf(now);
  const from = addDays(today, -1);
  const to = addDays(today, 2);
  return {
    days: window.rows.filter((row) => row.date >= from && row.date <= to),
    source: window.source,
  };
};
