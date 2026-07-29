import { NextRequest, NextResponse } from "next/server";
import { getLatestAqiReadings } from "@/lib/server/aqi/queries";

export const runtime = "nodejs";

export interface AqiSite {
  siteId: string;
  siteName: string;
  county: string;
  aqiValue: number | null;
  aqiStatus: string;
  aqiColor: string;
  pm25: number | null;
  pm10: number | null;
  o3: number | null;
  no2: number | null;
  so2: number | null;
  co: number | null;
  recordedAt: string | null;
}

function getStatusAndColor(aqi: number | null): { status: string; color: string } {
  if (aqi === null) return { status: "–", color: "#9ca3af" };
  if (aqi <= 50) return { status: "良好", color: "#22c55e" };
  if (aqi <= 100) return { status: "普通", color: "#eab308" };
  if (aqi <= 150) return { status: "對敏感族群不健康", color: "#f97316" };
  if (aqi <= 200) return { status: "對所有族群不健康", color: "#ef4444" };
  if (aqi <= 300) return { status: "非常不健康", color: "#8b5cf6" };
  return { status: "危害", color: "#7f1d1d" };
}

export async function GET(request: NextRequest) {
  const county = request.nextUrl.searchParams.get("county")?.trim();

  try {
    const rows = await getLatestAqiReadings(county);

    let latestRecordedAt: Date | null = null;
    const stations: AqiSite[] = rows.map((r): AqiSite => {
      if (!latestRecordedAt || r.recorded_at > latestRecordedAt) latestRecordedAt = r.recorded_at;
      const { status, color } = getStatusAndColor(r.aqi_value);
      return {
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
      };
    });
    const updatedAt = latestRecordedAt ? (latestRecordedAt as Date).toISOString() : null;

    return NextResponse.json({ stations, updatedAt });
  } catch (error) {
    console.error("GET /api/aqi failed:", error);
    return NextResponse.json({ error: "查詢 AQI 資料失敗" }, { status: 502 });
  }
}
