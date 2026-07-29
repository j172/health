import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { fetchNhiWeeklyHours } from "@/lib/server/facilities/sources/nhiWeeklyHours";
import { applyWeeklyHours } from "@/lib/server/facilities/queries";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Cloudflare's edge proxy caps how long it holds a client connection open
  // (~100s on non-Enterprise plans) well below how long a 30k-row fetch +
  // update can take, which previously surfaced as a client-facing "Request
  // Timeout" even though the job kept running fine server-side. Responding
  // immediately and letting the job finish in this long-lived pm2 process
  // (not a serverless one that would freeze after the response) avoids that
  // false-failure entirely — check facilities.extra_json / server logs for
  // the actual outcome.
  fetchNhiWeeklyHours()
    .then((entries) => applyWeeklyHours(entries))
    .then(({ matched }) => console.log(`facilities-hours-sync: matched ${matched} rows`))
    .catch((error) => console.error("facilities-hours-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
