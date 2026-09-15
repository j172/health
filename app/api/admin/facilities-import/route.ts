import { NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { upsertFacilities, deleteFacilitiesByType, type FacilityRecord } from "@/lib/server/facilities/queries";

export const runtime = "nodejs";
export const maxDuration = 60;

// Accepts pre-fetched facility records for sources the production host can't
// reach directly (e.g. ltcpap.mohw.gov.tw / ltcpgis.mohw.gov.tw, blocked for
// this host's IP range but reachable from a regular residential/office network)
// — run the fetch locally and POST the parsed records here instead.
export async function POST(request: Request): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => null);

  let deleted = 0;
  if (typeof body?.cleanFacilityType === "string" && body.cleanFacilityType.trim()) {
    try {
      deleted = await deleteFacilitiesByType(body.cleanFacilityType.trim());
    } catch (error) {
      return internalErrorResponse(error, "Failed to clean obsolete facility type");
    }
  }

  const records: FacilityRecord[] | undefined = body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    if (deleted > 0) {
      return NextResponse.json({ ok: true, deleted });
    }
    return NextResponse.json({ ok: false, error: "Missing or empty 'records' array" }, { status: 400 });
  }

  try {
    const { inserted, updated } = await upsertFacilities(records);
    return NextResponse.json({ ok: true, fetched: records.length, inserted, updated, deleted });
  } catch (error) {
    return internalErrorResponse(error, "Unknown import error");
  }
}
