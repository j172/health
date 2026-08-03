import { NextRequest, NextResponse } from "next/server";
import { getNearestAqiReading } from "@/lib/server/aqi/queries";
import { getAqiStatusAndColor } from "@/lib/server/aqi/status";
import type { AqiSite } from "@/lib/server/aqi/types";

export const runtime = "nodejs";

export interface NearestAqiSite extends AqiSite {
  distanceKm: number;
}

export async function GET(request: NextRequest) {
  const latParam = request.nextUrl.searchParams.get("lat");
  const lngParam = request.nextUrl.searchParams.get("lng");
  const lat = latParam !== null ? Number(latParam) : NaN;
  const lng = lngParam !== null ? Number(lngParam) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Missing or invalid lat/lng" }, { status: 400 });
  }

  try {
    const r = await getNearestAqiReading(lat, lng);
    if (!r) {
      return NextResponse.json({ station: null });
    }

    const { status, color } = getAqiStatusAndColor(r.aqi_value);
    const station: NearestAqiSite = {
      siteId: r.site_id,
      siteName: r.site_name,
      county: r.county,
      aqiValue: r.aqi_value,
      aqiStatus: r.aqi_status || status,
      aqiColor: color,
      pm25: r.pm25,
      pm10: r.pm10,
      o3: r.o3,
      no2: r.no2,
      so2: r.so2,
      co: r.co,
      recordedAt: r.recorded_at.toISOString(),
      distanceKm: Math.round(r.distance_km * 10) / 10,
    };

    return NextResponse.json({ station });
  } catch (error) {
    console.error("GET /api/aqi/nearest failed:", error);
    return NextResponse.json({ error: "查詢最近測站資料失敗" }, { status: 502 });
  }
}
