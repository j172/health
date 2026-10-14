import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { FACILITY_SOURCE_KEYS, runFacilitySync } from "@/lib/server/facilities/runSync";

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
  //
  // Optional body `{ "sources": ["tdx_aps", ...] }` runs only those sources.
  const body = (await request.json().catch(() => ({}))) as { sources?: unknown };
  let sources: string[] | undefined;
  if (body.sources !== undefined) {
    const requested = Array.isArray(body.sources) ? body.sources.filter((s): s is string => typeof s === "string") : [];
    const unknown = requested.filter((s) => !FACILITY_SOURCE_KEYS.includes(s));
    if (requested.length === 0 || unknown.length > 0) {
      return NextResponse.json(
        { ok: false, error: "sources must be a non-empty array of known source keys", unknown, known: FACILITY_SOURCE_KEYS },
        { status: 400 },
      );
    }
    sources = requested;
  }

  runFacilitySync(sources)
    .then((results) => console.log("facilities-sync results:", JSON.stringify(results)))
    .catch((error) => console.error("facilities-sync failed:", error));

  return NextResponse.json({ ok: true, status: "started", sources: sources ?? "all" }, { status: 202 });
}
