import { NextResponse } from "next/server";
import { env } from "@/lib/server/config/env";
import { upsertFacilities, type FacilityRecord } from "@/lib/server/facilities/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

// Accepts pre-fetched facility records for sources the production host can't
// reach directly (e.g. ltcpap.mohw.gov.tw, blocked for this host's IP range
// but reachable from a regular residential/office network) — run the fetch
// locally and POST the parsed records here instead.
export async function POST(request: Request): Promise<NextResponse> {
  const secret = request.headers.get("x-rss-sync-admin-secret") || "";
  if (secret !== env.rssSyncAdminSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const records: FacilityRecord[] | undefined = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ ok: false, error: "Missing or empty 'records' array" }, { status: 400 });
  }

  try {
    const { inserted, updated } = await upsertFacilities(records);
    return NextResponse.json({ ok: true, fetched: records.length, inserted, updated });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unknown import error" }, { status: 500 });
  }
}
