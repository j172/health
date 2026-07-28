import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { runDrugSync } from "@/lib/server/drugs/runSync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const results = await runDrugSync();
    return NextResponse.json({ ok: true, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown sync error" }, { status: 500 });
  }
}
