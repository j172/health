import { NextRequest, NextResponse } from "next/server";
import {
  getNearestRainfallReading,
  getNearestRainfallAccumulation,
} from "@/lib/server/cwa/queries";

export const runtime = "nodejs";

export interface NearestRainfallStation {
  stationName: string | null;
  county: string | null;
  town: string | null;
  observedAt: string | null;
  /** Millimetres. Strings, because CWA reports trace amounts as "T" and gaps as "-99". */
  now: string | null;
  past10Min: string | null;
  past1hr: string | null;
  past3hr: string | null;
  past6hr: string | null;
  past12hr: string | null;
  past24hr: string | null;
  distanceKm: number;
}

/**
 * Month- and year-to-date totals.
 *
 * These come from CWA's 38 staffed stations, not the 1,331 automatic gauges the
 * live reading uses, so they carry their own station name and distance — the
 * nearest staffed station can be considerably further away.
 */
export interface RainfallAccumulationSummary {
  stationName: string | null;
  monthMm: number | null;
  yearMm: number | null;
  wetDays30: number | null;
  distanceKm: number;
}

/**
 * Nearest rain gauge to a point, shaped for useNearestStation.
 *
 * CWA runs 1,331 of these and the data has been syncing into cwa_rainfall every
 * 30 minutes, unread, since the table was added.
 *
 * `-99` is CWA's no-data marker and would render as a bizarre negative rainfall,
 * so it is normalised to null here rather than in the component.
 */
const clean = (value: string | null): string | null => {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (trimmed === "" || trimmed === "-99" || trimmed === "-990") return null;
  return trimmed;
};

export async function GET(request: NextRequest) {
  const lat = Number(request.nextUrl.searchParams.get("lat"));
  const lng = Number(request.nextUrl.searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json(
      { error: "Missing or invalid lat/lng" },
      { status: 400 },
    );
  }

  try {
    const [reading, accumulation] = await Promise.all([
      getNearestRainfallReading(lat, lng),
      getNearestRainfallAccumulation(lat, lng),
    ]);
    if (!reading) return NextResponse.json({ station: null, totals: null });

    const station: NearestRainfallStation = {
      stationName: reading.station_name,
      county: reading.county_name,
      town: reading.town_name,
      observedAt: reading.obs_time
        ? new Date(reading.obs_time).toISOString()
        : null,
      now: clean(reading.precip_now),
      past10Min: clean(reading.precip_10min),
      past1hr: clean(reading.precip_1hr),
      past3hr: clean(reading.precip_3hr),
      past6hr: clean(reading.precip_6hr),
      past12hr: clean(reading.precip_12hr),
      past24hr: clean(reading.precip_24hr),
      distanceKm: Math.round(reading.distance_km * 10) / 10,
    };

    const totals: RainfallAccumulationSummary | null = accumulation
      ? {
          stationName: accumulation.station_name,
          monthMm: accumulation.month_mm,
          yearMm: accumulation.year_mm,
          wetDays30: accumulation.wet_days_30,
          distanceKm: Math.round(accumulation.distance_km * 10) / 10,
        }
      : null;

    return NextResponse.json({ station, totals });
  } catch (error) {
    console.error("GET /api/rainfall/nearest failed:", error);
    return NextResponse.json(
      { error: "查詢附近雨量資料失敗" },
      { status: 502 },
    );
  }
}
