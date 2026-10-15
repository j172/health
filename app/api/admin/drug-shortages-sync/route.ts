import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runDrugShortagesSync } from "@/lib/server/drugs/runShortagesSync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/drug-shortages-sync — issue #670. The two TFDA shortage
 * lists (54504/54505) normally refresh on a weekly cron (see
 * lib/server/cron/registerJobs.ts); this runs the same
 * `runDrugShortagesSync()` on demand so the first post-deploy run — and the
 * "second run inserts nothing" idempotency check — don't have to wait for
 * Monday. Two small JSON files (~200 KB total), so unlike
 * drugs-ingredients-sync it answers synchronously with the per-dataset counts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runDrugShortagesSync();
    return NextResponse.json({ ok: result.error === null, result });
  } catch (error) {
    return internalErrorResponse(error, "Unknown drug-shortages sync error");
  }
}
