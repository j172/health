import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runIaqPremisesSync } from "@/lib/server/iaqPremises/ingestIaqPremises";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/iaq-premises-sync — issue #156. Unlike facilities-import
 * (which accepts pre-fetched records), this route triggers the fetch itself:
 * same in-process ingest module the daily cron calls, exposed here for
 * manual triggering/verification without waiting for the cron tick.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runIaqPremisesSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return internalErrorResponse(error, "Unknown IAQ premises sync error");
  }
}
