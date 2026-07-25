import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { getRecentRuns } from "@/lib/server/logging/ingestionLogger";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getRecentRuns(20);
  return NextResponse.json({ ok: true, rows });
}