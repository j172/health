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
//
// Cut from 20/30 to 10/10 on 2026-08-17: a batch where most addresses need
// geocodeAddress()'s full fallback cascade (worst case now 3 throttled
// OpenCage+Nominatim round trips per address, see geocode.ts) was blowing
// past the 60s maxDuration above and dying mid-batch with a 500/502 —
// happening in practice once Google (removed) and OpenCage's daily quota
// were both exhausted, leaving every attempt to run the full
// Nominatim-throttled gauntlet. 10 keeps worst-case batch time comfortably
// under the 60s ceiling even when every address needs the full cascade.
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 10;

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
