import { NextResponse } from "next/server";
import { getDamStructureMapPoints } from "@/lib/server/wra/damStructureQueries";
import { getGroundwaterMapPoints } from "@/lib/server/wra/groundwaterQueries";
import { getInundationRegions } from "@/lib/server/wra/fetchInundationRegions";

// 經濟部水利署水資源物聯網 (iot.wra.gov.tw) 即時圖層 (issue #270) — 堤防結構安全
// 監測站、地下水位監測站，外加淹水範圍圖可用區域清單（純指標，非完整 raster 疊圖，
// 見 lib/server/wra/fetchInundationRegions.ts 的模組說明）。
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [damStructure, groundwater, inundationRegions] = await Promise.allSettled([
      getDamStructureMapPoints(),
      getGroundwaterMapPoints(),
      getInundationRegions(),
    ]);

    return NextResponse.json({
      ok: true,
      damStructurePoints: damStructure.status === "fulfilled" ? damStructure.value : [],
      groundwaterPoints: groundwater.status === "fulfilled" ? groundwater.value : [],
      inundationRegions: inundationRegions.status === "fulfilled" ? inundationRegions.value : [],
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error in /api/disaster/wra-iot:", error);
    return NextResponse.json(
      { ok: false, error: "無法取得水利署 IoT 即時監測資料", damStructurePoints: [], groundwaterPoints: [], inundationRegions: [] },
      { status: 500 },
    );
  }
}
