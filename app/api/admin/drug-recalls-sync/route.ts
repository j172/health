import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { runDrugRecallsSync } from "@/lib/server/drugs/runRecallsSync";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/admin/drug-recalls-sync — issue #675. The TFDA recalled-drug
 * register (6947) normally refreshes on a weekly cron (see
 * lib/server/cron/registerJobs.ts); this runs the same
 * `runDrugRecallsSync()` on demand so the first post-deploy run — and the
 * "second run inserts nothing" idempotency check — don't have to wait for the
 * next Monday. One ~700 KB JSON file, so it answers synchronously with the
 * counts.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  try {
    const result = await runDrugRecallsSync();
    return NextResponse.json({ ok: result.error === null, result });
  } catch (error) {
    return internalErrorResponse(error, "Unknown drug-recalls sync error");
  }
}
