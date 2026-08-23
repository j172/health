import { NextRequest, NextResponse } from "next/server";
import {
  getNearestRainfallOverview,
  listTopRainfallStations,
} from "@/lib/server/cwa/queries";

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

    const [nearest, topStations] = await Promise.all([
      !isNaN(lat) && !isNaN(lng) ? getNearestRainfallOverview(lat, lng) : null,
      listTopRainfallStations(5),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        nearest,
        topStations,
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
