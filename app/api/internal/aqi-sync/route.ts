import { NextResponse } from "next/server";
import { requireInternalSecret } from "@/lib/server/config/adminAuth";
import { runAqiSync } from "@/lib/server/aqi/runSync";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const unauthorized = requireInternalSecret(request);
  if (unauthorized) return unauthorized;

  const results = await runAqiSync();
  const failed = results.find((r) => r.error);
  if (failed) {
    return NextResponse.json({ ok: false, error: failed.error, results }, { status: 500 });
  }
  return NextResponse.json({ ok: true, results });
}
