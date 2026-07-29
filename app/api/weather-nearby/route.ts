import { NextRequest, NextResponse } from "next/server";
import { getNearestAqiReading } from "@/lib/server/aqi/queries";
import { getAqiStatusAndColor } from "@/lib/server/aqi/status";
import { getNearestUvReading } from "@/lib/server/cwa/queries";
import { getUvCategory } from "@/lib/server/cwa/uvStatus";

export const runtime = "nodejs";

// Nearest AQI station + nearest UV reading to a given point — powers the
// location-based header bar (replaces the earlier "top 5 nationwide" design,
// which didn't tell a reader anything about their own area).
export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Missing or invalid lat/lng" }, { status: 400 });
  }

  try {
    const [aqi, uv] = await Promise.all([getNearestAqiReading(lat, lng), getNearestUvReading(lat, lng)]);

    const aqiResult = aqi
      ? {
          siteName: aqi.site_name,
          county: aqi.county,
          aqiValue: aqi.aqi_value,
          ...getAqiStatusAndColor(aqi.aqi_value),
          distanceKm: Math.round(aqi.distance_km * 10) / 10,
        }
      : null;

    const uvResult = uv
      ? {
          stationName: uv.station_name,
          county: uv.county_name,
          uvIndex: uv.uv_index,
          ...getUvCategory(uv.uv_index),
          distanceKm: Math.round(uv.distance_km * 10) / 10,
        }
      : null;

    return NextResponse.json({ aqi: aqiResult, uv: uvResult });
  } catch (error) {
    console.error("GET /api/weather-nearby failed:", error);
    return NextResponse.json({ error: "查詢附近氣象資料失敗" }, { status: 502 });
  }
}
