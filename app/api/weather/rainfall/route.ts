import { NextRequest, NextResponse } from "next/server";
import {
  getNearestRainfallOverview,
  listTopRainfallStations,
  listActiveCwaAlerts,
} from "@/lib/server/cwa/queries";
import { filterCwaAlertsByCounty } from "@/lib/server/cwa/filterAlertsByCounty";
import { resolveNearestCounty } from "@/lib/server/facilities/countyBounds";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COUNTY_COORDINATES: Record<string, { lat: number; lng: number }> = {
  "基隆市": { lat: 25.1276, lng: 121.7392 },
  "臺北市": { lat: 25.0375, lng: 121.5637 },
  "台北市": { lat: 25.0375, lng: 121.5637 },
  "新北市": { lat: 25.0169, lng: 121.4627 },
  "桃園市": { lat: 24.9936, lng: 121.3009 },
  "新竹市": { lat: 24.8138, lng: 120.9675 },
  "新竹縣": { lat: 24.8387, lng: 121.0177 },
  "苗栗縣": { lat: 24.5602, lng: 120.8214 },
  "臺中市": { lat: 24.1477, lng: 120.6736 },
  "台中市": { lat: 24.1477, lng: 120.6736 },
  "彰化縣": { lat: 24.0518, lng: 120.5161 },
  "南投縣": { lat: 23.9037, lng: 120.6859 },
  "雲林縣": { lat: 23.7092, lng: 120.4313 },
  "嘉義市": { lat: 23.4800, lng: 120.4491 },
  "嘉義縣": { lat: 23.4518, lng: 120.2555 },
  "臺南市": { lat: 22.9997, lng: 120.2270 },
  "台南市": { lat: 22.9997, lng: 120.2270 },
  "高雄市": { lat: 22.6273, lng: 120.3014 },
  "屏東縣": { lat: 22.6761, lng: 120.4941 },
  "宜蘭縣": { lat: 24.7021, lng: 121.7377 },
  "花蓮縣": { lat: 23.9872, lng: 121.6015 },
  "臺東縣": { lat: 22.7583, lng: 121.1444 },
  "台東縣": { lat: 22.7583, lng: 121.1444 },
  "澎湖縣": { lat: 23.5712, lng: 119.5793 },
  "金門縣": { lat: 24.4493, lng: 118.3766 },
  "連江縣": { lat: 26.1505, lng: 119.9499 },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const latParam = searchParams.get("lat");
    const lngParam = searchParams.get("lng");
    const countyParam = searchParams.get("county");

    let lat = latParam ? parseFloat(latParam) : NaN;
    let lng = lngParam ? parseFloat(lngParam) : NaN;

    if ((isNaN(lat) || isNaN(lng)) && countyParam && COUNTY_COORDINATES[countyParam]) {
      lat = COUNTY_COORDINATES[countyParam].lat;
      lng = COUNTY_COORDINATES[countyParam].lng;
    }

    const hasCoords = !isNaN(lat) && !isNaN(lng);
    const [nearest, topStations, activeAlerts] = await Promise.all([
      hasCoords ? getNearestRainfallOverview(lat, lng) : null,
      listTopRainfallStations(5),
      hasCoords ? listActiveCwaAlerts(100) : Promise.resolve<Awaited<ReturnType<typeof listActiveCwaAlerts>>>([]),
    ]);

    // 所在縣市＋該縣市目前的特報（issue: 依定位看特報，比全國扁平清單直覺）。
    // resolveNearestCounty 現在是精確的點在多邊形內判斷，座標落在海上、離島邊界外側等
    // 情況會回傳 null（「無法判斷」，不是亂猜），countyAlerts 也會跟著是 null；
    // 沒有座標（純縣市下拉選擇）時兩者本來就皆為 null，維持舊行為。
    const county = hasCoords ? resolveNearestCounty(lat, lng) : null;
    const countyAlerts = county ? filterCwaAlertsByCounty(activeAlerts, county) : null;

    return NextResponse.json({
      success: true,
      data: {
        nearest,
        topStations,
        county,
        countyAlerts,
      },
    });
  } catch (error) {
    console.error("Failed to fetch rainfall data:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching rainfall data" },
      { status: 500 },
    );
  }
}
