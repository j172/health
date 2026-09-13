import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runPowerMixSync } from "@/lib/server/power/runSync";

export const runtime = "nodejs";

/** Manual trigger for the daily source (issue #177): 經濟部能源署 set_id=55 全國發電來源配比. */
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const results = await runPowerMixSync();
  const failed = results.find((r) => r.error);
  if (failed) {
    return NextResponse.json({ ok: false, error: failed.error, results }, { status: 500 });
  }
  return NextResponse.json({ ok: true, results });
}
