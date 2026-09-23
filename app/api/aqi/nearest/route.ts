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
    const CACHE_HEADERS = {
      "Cache-Control": "public, s-maxage=180, stale-while-revalidate=600",
    };

    if (!r) {
      return NextResponse.json({ station: null }, { headers: CACHE_HEADERS });
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

    return NextResponse.json({ station }, { headers: CACHE_HEADERS });
  } catch (error: any) {
    console.error("GET /api/aqi/nearest error:", error);
    return NextResponse.json(
      { station: null, error: error?.message || "Failed to query nearest AQI station" },
      { status: 500 },
    );
  }
}
