import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { runAqiSync } from "@/lib/server/aqi/runSync";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const results = await runAqiSync();
  const failed = results.find((r) => r.error);
  if (failed) {
    return NextResponse.json({ ok: false, error: failed.error, results }, { status: 500 });
  }
  return NextResponse.json({ ok: true, results });
}
