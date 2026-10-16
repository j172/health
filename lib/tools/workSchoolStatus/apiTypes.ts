import type { DayStatus, IsoDate, OfficeCalendarDay, UpcomingDay } from "./calendar";
import type { ClosureGuidance } from "./closureGuidance";

/** Source of the calendar rows behind an answer — see lib/server/officeCalendar/calendarSource.ts. */
export type CalendarDataSource = "db" | "mixed" | "seed" | "none";

/** JSON body of GET /api/tools/work-school-status (issue #691). */
export interface WorkSchoolStatusResponse {
  ok: true;
  timeZone: string;
  generatedAt: string;
  asOf: IsoDate;
  today: DayStatus;
  tomorrow: DayStatus;
  upcoming: UpcomingDay[];
  window: {
    from: IsoDate;
    to: IsoDate;
    coveredFrom: IsoDate | null;
    coveredTo: IsoDate | null;
    truncated: boolean;
  };
  calendar: {
    source: CalendarDataSource;
    degraded: boolean;
    syncedAt: string | null;
    seedRetrievedAt: string | null;
    officialUrl: string;
    datasetUrl: string;
  };
  /** The rows the answer was computed from; the client re-derives today/tomorrow from them with its own clock. */
  days: OfficeCalendarDay[];
  closure: ClosureGuidance;
}
