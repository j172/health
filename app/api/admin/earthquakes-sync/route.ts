import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { runEarthquakeSync } from "@/lib/server/earthquakes/runSync";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Fuzzy-matching every event against the table individually keeps this
  // fast enough (typically well under a hundred events per 5-minute window)
  // to just await it directly rather than the 202 fire-and-forget pattern
  // used for the much larger facilities/CWA syncs.
  const results = await runEarthquakeSync();
  return NextResponse.json({ ok: true, results });
}
