import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runWraDroughtSync } from "@/lib/server/wra/runSync";

export const runtime = "nodejs";

/**
 * Manual trigger for the 水利署枯旱限水通報 sync, which otherwise runs daily at
 * 07:00 from lib/server/cron/registerJobs.ts.
 *
 * Unlike cwa-sync this awaits its result: it is a single small feed reduced to
 * one row per reservoir, so it finishes well inside the edge-proxy timeout, and
 * returning the counts is what makes the spec's manual verification steps
 * (docs/specs/phase5-wra-drought-alerts.md section 6) possible.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const result = await runWraDroughtSync();
  return NextResponse.json(
    { ok: result.error === null, result },
    { status: result.error === null ? 200 : 502 },
  );
}
