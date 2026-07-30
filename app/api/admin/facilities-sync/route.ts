import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { runFacilitySync } from "@/lib/server/facilities/runSync";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  // Fetching every source (some tens of thousands of rows) easily exceeds
  // Cloudflare's edge-proxy connection cap (~100s on non-Enterprise plans),
  // which previously showed up as a client-facing "Request Timeout" even
  // though the sync kept running fine server-side. Respond immediately and
  // let it finish in this long-lived pm2 process — check the facilities
  // table or server logs for the actual outcome.
  runFacilitySync()
    .then((results) => console.log("facilities-sync results:", JSON.stringify(results)))
    .catch((error) => console.error("facilities-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started" }, { status: 202 });
}
