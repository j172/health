import { NextRequest, NextResponse } from "next/server";
import { getNearestAqiReading } from "@/lib/server/aqi/queries";
import { getAqiStatusAndColor } from "@/lib/server/aqi/status";
import { getNearestPm25Reading } from "@/lib/server/aqi/pm25Queries";
import { zoneForCounty, getForecastForZone } from "@/lib/server/aqi/forecastQueries";
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
    const [aqi, pm25, uv] = await Promise.all([getNearestAqiReading(lat, lng), getNearestPm25Reading(lat, lng), getNearestUvReading(lat, lng)]);

    const aqiResult = aqi
      ? {
          siteName: aqi.site_name,
          county: aqi.county,
          aqiValue: aqi.aqi_value,
          ...getAqiStatusAndColor(aqi.aqi_value),
          distanceKm: Math.round(aqi.distance_km * 10) / 10,
        }
      : null;

    const pm25Result = pm25
      ? {
          siteName: pm25.site_name,
          county: pm25.county,
          pm25: pm25.pm25,
          distanceKm: Math.round(pm25.distance_km * 10) / 10,
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

    // The forecast is zone-based (空品區), not station-based — resolve the
    // zone from whichever nearest station (AQI or UV) actually has a county.
    const county = aqi?.county ?? uv?.county_name ?? null;
    const zone = county ? zoneForCounty(county) : null;
    const forecast = zone ? await getForecastForZone(zone) : null;
    const forecastResult = forecast
      ? {
          zone: forecast.zone,
          forecastDate: forecast.forecast_date,
          aqiValue: forecast.aqi_value,
          majorPollutant: forecast.major_pollutant,
          ...getAqiStatusAndColor(forecast.aqi_value),
        }
      : null;

    return NextResponse.json({ aqi: aqiResult, pm25: pm25Result, uv: uvResult, forecast: forecastResult });
  } catch (error) {
    console.error("GET /api/weather-nearby failed:", error);
    return NextResponse.json({ error: "查詢附近氣象資料失敗" }, { status: 502 });
  }
}
