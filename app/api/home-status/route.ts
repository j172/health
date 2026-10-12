import { NextRequest, NextResponse } from "next/server";
import { aggregateHomeStatusSections } from "@/lib/server/home/aggregate";
import {
  fetchHomeStatusAlerts,
  fetchHomeStatusAqi,
  fetchHomeStatusEarthquakes,
  fetchHomeStatusUv,
  fetchHomeStatusWeather,
  type HomeStatusAqi,
  type HomeStatusUv,
  type HomeStatusWeather,
} from "@/lib/server/home/queries";
import type { CwaAlertItem } from "@/lib/server/cwa/queries";
import type { SignificantEarthquake } from "@/lib/server/earthquakes/queries";

export const runtime = "nodejs";

export type HomeStatusSection<T> =
  | { status: "ok"; data: T; error?: undefined; reason?: undefined }
  | { status: "error"; data: null; error: string; reason?: undefined }
  | { status: "unavailable"; data: null; reason: "no-location"; error?: undefined };

/** Shape of this route's JSON body — imported by components/Home/HomeStatusBar.tsx, the sole caller. */
export interface HomeStatusResponse {
  lat: number | null;
  lng: number | null;
  sections: {
    weather: HomeStatusSection<HomeStatusWeather | null>;
    aqi: HomeStatusSection<HomeStatusAqi | null>;
    uv: HomeStatusSection<HomeStatusUv | null>;
    earthquake: HomeStatusSection<SignificantEarthquake[]>;
    alerts: HomeStatusSection<CwaAlertItem[]>;
  };
}

/**
 * Homepage status-bar aggregation API (issue #472, parent #438 §G): one
 * request for all 5 sections the top status bar needs (天氣、AQI、UV、最新
 * 地震、警報), replacing the old homepage sidebar's ~8 independent per-widget
 * client fetches (LocalWeatherSvgWidget/AqiSidebarWidget/UvSidebarWidget/
 * ErStatusSidebarWidget/CpcPriceSidebarWidget/WaterOutageSidebarWidget/
 * CdcAlertSidebarWidget/PestAlertSidebarWidget each calling their own
 * endpoint) — see components/Home/HomeStatusBar.tsx, the sole caller.
 *
 * `lat`/`lng` are optional, unlike `/api/nearby` (issue #466) which requires
 * them: weather/AQI/UV are location-dependent, but the latest-earthquake and
 * active-alerts sections are nationwide and have something useful to show
 * even before (or without) a location — e.g. while the browser's geolocation
 * permission prompt is still pending, or after the user has denied/timed out
 * (see useSharedGeolocation's `needsManualSelection`). When lat/lng are
 * missing or non-numeric, the 3 location-dependent sections come back with
 * `status: "unavailable"` instead of being queried with a guessed
 * coordinate — this endpoint must never silently substitute a default
 * location (the exact Taipei-101-default bug class issue #466/#477 already
 * fixed elsewhere in this codebase).
 *
 * Every section is isolated via `aggregateHomeStatusSections`
 * (Promise.allSettled): one section's query throwing only turns that one
 * section's own result into `status: "error"`, never drops or crashes the
 * other 4 (acceptance criterion: "任一區塊資料來源暫時失敗，只有那一區顯示
 * 錯誤狀態，其他區塊正常顯示").
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const params = request.nextUrl.searchParams;
  const latParam = params.get("lat");
  const lngParam = params.get("lng");
  const lat = latParam !== null ? Number(latParam) : NaN;
  const lng = lngParam !== null ? Number(lngParam) : NaN;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);

  const [alwaysOn, locationDependent] = await Promise.all([
    aggregateHomeStatusSections<{
      earthquake: SignificantEarthquake[];
      alerts: CwaAlertItem[];
    }>({
      earthquake: () => fetchHomeStatusEarthquakes(3),
      alerts: () => fetchHomeStatusAlerts(5),
    }),
    hasCoords
      ? aggregateHomeStatusSections<{
          weather: HomeStatusWeather | null;
          aqi: HomeStatusAqi | null;
          uv: HomeStatusUv | null;
        }>({
          weather: () => fetchHomeStatusWeather(lat, lng),
          aqi: () => fetchHomeStatusAqi(lat, lng),
          uv: () => fetchHomeStatusUv(lat, lng),
        })
      : null,
  ]);

  const unavailable = { status: "unavailable" as const, data: null, reason: "no-location" as const };

  const sections = {
    weather: locationDependent ? locationDependent.weather : unavailable,
    aqi: locationDependent ? locationDependent.aqi : unavailable,
    uv: locationDependent ? locationDependent.uv : unavailable,
    earthquake: alwaysOn.earthquake,
    alerts: alwaysOn.alerts,
  };

  return NextResponse.json(
    { lat: hasCoords ? lat : null, lng: hasCoords ? lng : null, sections },
    {
      headers: {
        // Per-visitor (keyed by the exact lat/lng query string, same as
        // /api/aqi/nearest and /api/uv/nearest already do) rather than a
        // single shared cache entry — short enough that a moved user isn't
        // stuck on a stale reading for long, long enough to absorb repeat
        // loads within the same browsing session.
        "Cache-Control": "public, s-maxage=180, stale-while-revalidate=600",
      },
    },
  );
}
