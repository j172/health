import { NextRequest, NextResponse } from "next/server";
import { getNearestUvReading } from "@/lib/server/cwa/queries";
import { getUvCategory } from "@/lib/server/cwa/uvStatus";

export const runtime = "nodejs";

export interface NearestUvStation {
  stationId: string;
  stationName: string | null;
  county: string | null;
  uvIndex: number;
  uvLabel: string;
  uvColor: string;
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
    const r = await getNearestUvReading(lat, lng);
    if (!r) {
      return NextResponse.json({ station: null });
    }

    const { label, color } = getUvCategory(r.uv_index);
    const station: NearestUvStation = {
      stationId: r.station_id,
      stationName: r.station_name,
      county: r.county_name,
      uvIndex: r.uv_index,
      uvLabel: label,
      uvColor: color,
      distanceKm: Math.round(r.distance_km * 10) / 10,
    };

    return NextResponse.json({ station });
  } catch (error) {
    console.error("GET /api/uv/nearest failed:", error);
    return NextResponse.json({ error: "查詢最近測站資料失敗" }, { status: 502 });
  }
}
