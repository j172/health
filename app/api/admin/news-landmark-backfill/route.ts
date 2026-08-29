import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runNewsLandmarkBackfill } from "@/lib/server/news/landmarkBackfill";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Operator-triggered batch that re-applies the current landmark rules to
 * `news_items` rows that already hold a landmark. See
 * `lib/server/news/landmarkBackfill.ts` and
 * docs/specs/news-landmark-backfill.md.
 *
 * Request  (all fields optional):
 *   POST /api/admin/news-landmark-backfill
 *   x-rss-sync-admin-secret: <secret>
 *   { "limit": 100, "afterId": 0, "dryRun": true }
 *
 *   limit    1..500, default 100
 *   afterId  resume cursor; pass back the previous response's summary.cursor.next
 *   dryRun   DEFAULT true. Writes happen only when this is EXACTLY false.
 *
 * Response: { ok: true, summary: NewsLandmarkBackfillSummary }
 *
 * There is deliberately no scheduled workflow for this endpoint; cron-ing it
 * would recreate the load pattern behind the 2026-08-29 outage.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    let limit = 100;
    let afterId = 0;
    // Dry run is the default, and stays the default when the body is missing or
    // unparseable. Only an explicit `false` turns writing on.
    let dryRun = true;

    try {
      const body = await request.json();
      if (body && typeof body.limit === "number") {
        limit = Math.min(500, Math.max(1, Math.trunc(body.limit)));
      }
      if (body && typeof body.afterId === "number") {
        afterId = Math.max(0, Math.trunc(body.afterId));
      }
      if (body && body.dryRun === false) {
        dryRun = false;
      }
    } catch {
      // Empty or invalid body is acceptable; use the defaults above (dry run).
    }

    const summary = await runNewsLandmarkBackfill({ limit, afterId, dryRun });
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return internalErrorResponse(error, "Unknown news landmark backfill error");
  }
}
