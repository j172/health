import { NextResponse } from "next/server";
import { cacheInit } from "@/lib/server/http/cacheControl";
import { countyForRouteCity } from "@/lib/tools/garbageTrucks/coverage";
import { parseGarbageRouteSearchParams } from "@/lib/server/garbageRoutes/searchParams";
import { getGarbageRouteCityMeta, searchGarbageRouteStops } from "@/lib/server/garbageRoutes/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/garbage-routes?city=taipei|new_taipei[&district=][&keyword=][&limit=][&offset=]
 *
 * Issue #674 (B-16): scheduled garbage-truck stops for the 路線與收運時間 tab
 * of /tools/cleaning-squads. Only the two covered cities exist here; any other
 * county is handled by the UI (it says 尚無路線資料，請洽清潔隊 and points to the
 * 清潔隊 contact tab) without calling this route. Data is synced once a day, so
 * success responses carry an explicit short s-maxage rather than relying on
 * the upstream's unlabeled-route default (spec §4.4). The keyword a visitor
 * types is never logged.
 */
export async function GET(request: Request) {
  const parsed = parseGarbageRouteSearchParams(new URL(request.url).searchParams);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error, stops: [] }, { status: 400 });
  }
  const { params } = parsed;

  try {
    const [{ total, stops }, meta] = await Promise.all([
      searchGarbageRouteStops(params),
      getGarbageRouteCityMeta(params.city),
    ]);
    return NextResponse.json(
      {
        ok: true,
        city: params.city,
        county: countyForRouteCity(params.city),
        total,
        limit: params.limit,
        offset: params.offset,
        stops,
        districts: meta.districts,
        syncedAt: meta.syncedAt,
      },
      cacheInit("medium"),
    );
  } catch (error) {
    console.error("GET /api/garbage-routes failed:", error instanceof Error ? error.message : "unknown error");
    return NextResponse.json({ ok: false, error: "Failed to load garbage route data", stops: [] }, { status: 500 });
  }
}
