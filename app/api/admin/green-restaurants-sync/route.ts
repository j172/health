import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runGreenRestaurantsSync } from "@/lib/server/greenRestaurants/ingestGreenRestaurants";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/green-restaurants-sync — issue #163. Same in-process
 * ingest module the daily cron calls, exposed here for manual
 * triggering/verification without waiting for the cron tick, following the
 * exact pattern of /api/admin/cool-spots-sync (issue #156).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runGreenRestaurantsSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return internalErrorResponse(error, "Unknown green restaurants sync error");
  }
}
