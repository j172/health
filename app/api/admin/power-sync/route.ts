import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runPowerRealtimeSync } from "@/lib/server/power/runSync";

export const runtime = "nodejs";

/** Manual trigger for the ~10-minute-cadence sources (issue #177): d006001 units + d525001 radiation stations. */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const results = await runPowerRealtimeSync();
  const failed = results.find((r) => r.error);
  if (failed) {
    return NextResponse.json({ ok: false, error: failed.error, results }, { status: 500 });
  }
  return NextResponse.json({ ok: true, results });
}
