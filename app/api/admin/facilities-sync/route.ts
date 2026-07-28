import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { runFacilitySync } from "@/lib/server/facilities/runSync";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runFacilitySync();
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown sync error" }, { status: 500 });
  }
}
