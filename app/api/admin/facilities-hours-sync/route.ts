import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { fetchNhiWeeklyHours } from "@/lib/server/facilities/sources/nhiWeeklyHours";
import { applyWeeklyHours } from "@/lib/server/facilities/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const entries = await fetchNhiWeeklyHours();
    const { matched } = await applyWeeklyHours(entries);
    return NextResponse.json({ ok: true, fetched: entries.length, matched });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
