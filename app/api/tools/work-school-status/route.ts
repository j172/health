import { NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { loadCalendarWindow } from "@/lib/server/officeCalendar/calendarSource";
import { isTyphoonWarningActive } from "@/lib/server/officeCalendar/typhoonWarning";
import { buildWorkdayAnswer, OFFICE_CALENDAR_TIME_ZONE } from "@/lib/tools/workSchoolStatus/calendar";
import {
  buildClosureGuidance,
  DGPA_CALENDAR_PAGE_URL,
  OFFICE_CALENDAR_DATASET_PAGE_URL,
} from "@/lib/tools/workSchoolStatus/closureGuidance";

export const runtime = "nodejs";

/**
 * GET /api/tools/work-school-status — data for /tools/work-school-status and a
 * handle for post-deploy checks (issue #691).
 *
 * Two independent answers in one payload:
 *
 * 1. `today` / `tomorrow` / `upcoming` — the government office calendar, as the
 *    Asia/Taipei calendar date of this request (never the host's time zone).
 *    `days` is the raw window the answer was computed from, so a client whose
 *    cached copy has crossed midnight can recompute locally with the same pure
 *    function (lib/tools/workSchoolStatus/calendar.ts). `calendar.source` says
 *    whether the rows came from the synced table (`db`), the committed seed
 *    (`seed`), both (`mixed`) or nowhere (`none` — then every answer is
 *    `unknown`, never guessed from the weekday).
 * 2. `closure` — 天然災害停止上班及上課. Always `mode: "link-only"`: this site
 *    holds no per-county status (no stable machine-readable source exists; see
 *    lib/tools/workSchoolStatus/closureGuidance.ts) and says so. The only live
 *    fact in it is whether a CWA typhoon warning is in force, which is a prompt
 *    to read the official announcement, not a closure.
 *
 * Always 200 with an explicit short Cache-Control: a failing table degrades to
 * the seed rather than to an error page, and a degraded answer must not be
 * pinned at the edge for long.
 */
export async function GET() {
  const now = new Date();
  const [window, typhoonWarning] = await Promise.all([loadCalendarWindow({ now: () => now }), isTyphoonWarningActive()]);
  const answer = buildWorkdayAnswer(window.rows, now);

  return NextResponse.json(
    {
      ok: true,
      timeZone: OFFICE_CALENDAR_TIME_ZONE,
      generatedAt: now.toISOString(),
      asOf: answer.asOf,
      today: answer.today,
      tomorrow: answer.tomorrow,
      upcoming: answer.upcoming,
      window: {
        from: answer.windowFrom,
        to: answer.windowTo,
        coveredFrom: answer.coveredFrom,
        coveredTo: answer.coveredTo,
        truncated: answer.windowTruncated,
      },
      calendar: {
        source: window.source,
        degraded: window.degraded,
        syncedAt: window.syncedAt,
        seedRetrievedAt: window.seedRetrievedAt,
        officialUrl: DGPA_CALENDAR_PAGE_URL,
        datasetUrl: OFFICE_CALENDAR_DATASET_PAGE_URL,
      },
      days: window.rows,
      closure: buildClosureGuidance(typhoonWarning),
    },
    cacheInit("fast"),
  );
}
