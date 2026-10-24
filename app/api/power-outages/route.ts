import { NextResponse } from "next/server";
import { getPowerOutages } from "@/lib/server/power/outageService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
};

/**
 * GET /api/power-outages
 *
 * Ingests live outage KML dataset [44799] (d006012) from Taipower.
 * Returns parsed village geometry polygons and aggregate outage metrics.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const data = await getPowerOutages();
    return NextResponse.json({ success: true, data }, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/power-outages failed:", error);
    return NextResponse.json(
      { success: false, error: "無法取得即時停電資料" },
      { status: 500, headers: CACHE_HEADERS },
    );
  }
}
