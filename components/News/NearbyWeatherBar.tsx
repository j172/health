"use client";

import { useEffect, useState } from "react";
import { useGeolocation } from "@/components/Facilities/useGeolocation";

interface NearbyWeatherResponse {
  aqi: {
    siteName: string;
    county: string;
    aqiValue: number | null;
    status: string;
    color: string;
    distanceKm: number;
  } | null;
  pm25: {
    siteName: string;
    county: string;
    pm25: number | null;
    distanceKm: number;
  } | null;
  uv: {
    stationName: string | null;
    county: string | null;
    uvIndex: number;
    label: string;
    color: string;
    distanceKm: number;
  } | null;
  rainfall: {
    stationName: string | null;
    county: string | null;
    town: string | null;
    now: string | null;
    past1hr: string | null;
    past24hr: string | null;
    distanceKm: number;
  } | null;
  forecast: {
    zone: string;
    forecastDate: string;
    aqiValue: number | null;
    majorPollutant: string | null;
    status: string;
    color: string;
  } | null;
}

const formatForecastDate = (isoDate: string): string => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);
  if (isoDate === todayStr) return "今日";
  if (isoDate === tomorrowStr) return "明日";
  const [, m, d] = isoDate.split("-");
  return `${Number(m)}/${Number(d)}`;
};

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

  if (
    !data ||
    (!data.aqi && !data.pm25 && !data.uv && !data.rainfall && !data.forecast)
  )
    return null;

  return (
    <div className="border-b border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/60">
      <div className="mx-auto flex max-w-5xl items-center gap-2 overflow-x-auto px-4 py-1.5 text-xs font-medium text-sky-900 sm:px-6 lg:px-8 dark:text-sky-200">
        <span aria-hidden="true">📍</span>
        <span className="shrink-0">附近測站：</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {data.aqi ? (
            <span className="whitespace-nowrap">
              {data.aqi.county}
              {data.aqi.siteName} AQI {data.aqi.aqiValue ?? "–"}
              <span
                style={{ color: data.aqi.color }}
                className="ml-1 font-semibold"
              >
                ({data.aqi.status})
              </span>
            </span>
          ) : null}
          {data.pm25 ? (
            <span className="whitespace-nowrap">
              {data.pm25.county}
              {data.pm25.siteName} PM2.5 {data.pm25.pm25 ?? "–"}
            </span>
          ) : null}
          {data.uv ? (
            <span className="whitespace-nowrap">
              {data.uv.county}
              {data.uv.stationName} UV {data.uv.uvIndex}
              <span
                style={{ color: data.uv.color }}
                className="ml-1 font-semibold"
              >
                ({data.uv.label})
              </span>
            </span>
          ) : null}
          {data.rainfall ? (
            <span className="whitespace-nowrap">
              🌧️{data.rainfall.county}
              {data.rainfall.stationName} 時雨量 {data.rainfall.past1hr ?? "–"}
              mm
              <span className="ml-1 text-slate-400">
                （今累積 {data.rainfall.past24hr ?? "–"}mm）
              </span>
            </span>
          ) : null}
          {data.forecast ? (
            <span className="whitespace-nowrap">
              🔮{data.forecast.zone}空品區（
              {formatForecastDate(data.forecast.forecastDate)}）AQI{" "}
              {data.forecast.aqiValue ?? "–"}
              <span
                style={{ color: data.forecast.color }}
                className="ml-1 font-semibold"
              >
                ({data.forecast.status})
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
