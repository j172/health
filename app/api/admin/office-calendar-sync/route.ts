import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runOfficeCalendarSync } from "@/lib/server/officeCalendar/runSync";

export const runtime = "nodejs";

/**
 * POST /api/admin/office-calendar-sync — issue #691. The office-calendar sync
 * only runs on a weekly cron (`34 6 * * 3`); this exposes the same
 * `runOfficeCalendarSync()` the cron calls so it can be triggered right after
 * deploy — without it the table stays empty until the next Wednesday and the
 * page runs from the committed seed. Same fire-and-forget 202 pattern as the
 * other `/api/admin/*-sync` routes.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  runOfficeCalendarSync()
    .then((result) => console.log("office-calendar-sync result:", JSON.stringify(result)))
    .catch((error) => console.error("office-calendar-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
