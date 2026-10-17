import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { getRecentRuns } from "@/lib/server/logging/ingestionLogger";

export const runtime = "nodejs";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 200;
const WORD = /^[a-z][a-z-]{0,48}$/;

const intParam = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null || !/^\d{1,6}$/.test(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
};

/**
 * GET /api/admin/ingestion-runs
 *   ?limit=20        (1-200)   how many rows
 *   &offset=0                  skip the newest N matching rows, to page back past the latest page
 *   &status=failed             running | success | failed | skipped
 *   &trigger=internal-cron     internal-cron | admin-manual | ...
 *
 * Every parameter is optional; with none it returns the newest 20 rows, as before. Added for issue #699, where the
 * evidence for "which runs died and when" had scrolled off the end of a fixed 20-row window.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const trigger = params.get("trigger");
  if ((status !== null && !WORD.test(status)) || (trigger !== null && !WORD.test(trigger))) {
    return NextResponse.json({ ok: false, error: "invalid status or trigger" }, { status: 400 });
  }

  const limit = intParam(params.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = intParam(params.get("offset"), 0, 0, 1_000_000);
  const rows = await getRecentRuns(limit, {
    offset,
    status: status ?? undefined,
    triggerType: trigger ?? undefined,
  });
  return NextResponse.json({ ok: true, limit, offset, rows });
}
