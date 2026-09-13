import { NextResponse } from "next/server";
import { getGenerationUnits, getGenerationMix, getRadiationStations } from "@/lib/server/power/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

/**
 * GET /api/power-grid-overview — issue #177's 全台電力概況儀表板. Returns the
 * latest snapshot of all three sources in one response: 台電 d006001 各機組即
 * 時發電量, 經濟部能源署 set_id=55 全國發電來源配比, and 台電 d525001 核電廠
 * 周邊輻射偵測站 (安全監測 — see docs/specs/taipower-energy-dashboard.md for
 * why this is not outage data).
 */
export async function GET(): Promise<NextResponse> {
  try {
    const [units, mix, radiationStations] = await Promise.all([
      getGenerationUnits(),
      getGenerationMix(),
      getRadiationStations(),
    ]);
    return NextResponse.json({ units, mix, radiationStations }, { headers: NO_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/power-grid-overview failed:", error);
    return NextResponse.json(
      { error: "查詢全台電力概況資料失敗" },
      { status: 502, headers: NO_CACHE_HEADERS },
    );
  }
}
