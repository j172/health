import { NextRequest, NextResponse } from "next/server";
import { requireAdminSecret } from "@/lib/server/config/adminAuth";
import { internalErrorResponse } from "@/lib/server/http/errorResponse";
import { findFacilitiesMissingCoords, updateFacilityCoords, recordGeocodeFailure } from "@/lib/server/facilities/queries";
import { geocodeAddress } from "@/lib/server/facilities/geocode";

export const runtime = "nodejs";
export const maxDuration = 60;

// Nominatim's ~1 req/sec policy means only a small batch fits in one request/
// response cycle (shared hosting also caps how long a single PHP-proxied
// request may run) — call this repeatedly (e.g. from a cron or manually)
// until `remaining` reaches 0, same pattern as /api/admin/news-images.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const unauthorized = requireAdminSecret(request);
  if (unauthorized) return unauthorized;

  const body = await request.json().catch(() => ({}));
  const facilityType = String(body.facilityType || "");
  const sourceKey = String(body.sourceKey || "");
  const limit = Math.min(Number(body.limit) || DEFAULT_LIMIT, MAX_LIMIT);

  if (!facilityType || !sourceKey) {
    return NextResponse.json({ ok: false, error: "Missing required 'facilityType' or 'sourceKey'" }, { status: 400 });
  }

  try {
    const pending = await findFacilitiesMissingCoords(facilityType, sourceKey, limit);
    let geocoded = 0;
    let failed = 0;

    for (const facility of pending) {
      const coords = await geocodeAddress(facility.address);
      if (coords) {
        await updateFacilityCoords(facility.id, coords.lat, coords.lng);
        geocoded++;
      } else {
        await recordGeocodeFailure(facility.id);
        failed++;
      }
    }

    return NextResponse.json({ ok: true, summary: { attempted: pending.length, geocoded, failed } });
  } catch (error) {
    return internalErrorResponse(error, "Unknown geocode error");
  }
}
