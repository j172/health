"use client";

import { useEffect, useState } from "react";
import { useGeolocation } from "@/components/Facilities/useGeolocation";

interface NearbyWeatherResponse {
  aqi: { siteName: string; county: string; aqiValue: number | null; status: string; color: string; distanceKm: number } | null;
  uv: { stationName: string | null; county: string | null; uvIndex: number; label: string; color: string; distanceKm: number } | null;
}

/** Nearest AQI station + nearest UV reading to the reader's own location — replaces the earlier "top 5 nationwide" design, which didn't tell a reader anything about their own area. Client-side since geolocation only exists in the browser. */
export default function NearbyWeatherBar() {
  const location = useGeolocation();
  const [data, setData] = useState<NearbyWeatherResponse | null>(null);

  useEffect(() => {
    if (location.loading) return;
    let cancelled = false;

    fetch(`/api/weather-nearby?lat=${location.lat}&lng=${location.lng}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [location.loading, location.lat, location.lng]);

  if (!data || (!data.aqi && !data.uv)) return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50">
      <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs font-medium text-sky-900 sm:px-6 lg:px-8">
        <span aria-hidden="true">📍</span>
        <span className="shrink-0">附近測站：</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {data.aqi ? (
            <span className="whitespace-nowrap">
              {data.aqi.county}
              {data.aqi.siteName} AQI {data.aqi.aqiValue ?? "–"}
              <span style={{ color: data.aqi.color }} className="ml-1 font-semibold">
                ({data.aqi.status})
              </span>
            </span>
          ) : null}
          {data.uv ? (
            <span className="whitespace-nowrap">
              {data.uv.county}
              {data.uv.stationName} UV {data.uv.uvIndex}
              <span style={{ color: data.uv.color }} className="ml-1 font-semibold">
                ({data.uv.label})
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
