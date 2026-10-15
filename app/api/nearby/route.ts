import { NextRequest, NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { fetchNearbyResults } from "@/lib/server/nearby/queries";
import { NEARBY_DEFAULT_TYPE_KEYS, NEARBY_MAX_TYPES_PER_REQUEST } from "@/lib/server/nearby/registry";

export const runtime = "nodejs";

/**
 * "/nearby" page's aggregation API (issue #466): one request, up to
 * NEARBY_MAX_TYPES_PER_REQUEST (8) facility/ER/shelter types queried in
 * parallel, each isolated via fetchNearbyResults -> aggregateNearbyTypes
 * (Promise.allSettled) so one type's query failing never drops or crashes
 * the others (acceptance criterion: "任一類型查詢失敗不影響其他類型正常顯示").
 *
 * - No `types=` param -> the 8 defaults (issue #466's acceptance criteria 1).
 * - `types=<key>[,<key>...]` -> exactly those types, e.g. a single key for
 *   the page's "更多類型" progressive loading (one type per request, lazy,
 *   never prefetching the rest — see components/Nearby/NearbyContent.tsx).
 * - More than NEARBY_MAX_TYPES_PER_REQUEST keys are rejected outright (400)
 *   rather than silently truncated, so a caller never gets back fewer types
 *   than it thinks it asked for without being told.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;

  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const lat = latParam ? Number(latParam) : NaN;
  const lng = lngParam ? Number(lngParam) : NaN;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Missing or invalid required 'lat'/'lng' query params" }, { status: 400 });
  }

  const typesParam = params.get("types")?.trim();
  const requestedKeys = typesParam
    ? typesParam
        .split(",")
        .map((key) => key.trim())
        .filter(Boolean)
    : NEARBY_DEFAULT_TYPE_KEYS;

  if (requestedKeys.length === 0) {
    return NextResponse.json({ error: "'types' must list at least one type" }, { status: 400 });
  }
  if (requestedKeys.length > NEARBY_MAX_TYPES_PER_REQUEST) {
    return NextResponse.json(
      { error: `A single request may query at most ${NEARBY_MAX_TYPES_PER_REQUEST} types` },
      { status: 400 },
    );
  }

  const limitParam = params.get("limit") ? Number(params.get("limit")) : 3;
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.trunc(limitParam), 1), 10) : 3;

  const { results, unknownKeys } = await fetchNearbyResults(requestedKeys, lat, lng, limit);

  return NextResponse.json({ lat, lng, limit, results, unknownKeys }, cacheInit("none"));
}
