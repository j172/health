import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { runCwaSync } from "@/lib/server/cwa/runSync";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // 8 sequential dataset fetches easily exceeds Cloudflare's edge-proxy
  // connection cap (~100s on non-Enterprise plans) — respond immediately and
  // let it finish in this long-lived pm2 process, same as facilities-sync/
  // facilities-hours-sync. Check the cwa_* tables or server logs for outcome.
  runCwaSync()
    .then((results) => console.log("cwa-sync results:", JSON.stringify(results)))
    .catch((error) => console.error("cwa-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
