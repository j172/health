"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SidebarWidgetShell from "./SidebarWidgetShell";

interface StationWeather {
  station_id: string;
  station_name: string | null;
  county_name: string | null;
  town_name: string | null;
  obs_time: string;
  weather: string | null;
  precipitation: string | null;
  wind_speed: string | null;
  air_temperature: string | null;
  relativeHumidity: string | null;
  distance_km: number;
}

function WeatherSvgIcon({ condition }: { condition: string | null }) {
  const c = condition || "";
  
  if (c.includes("雷")) {
    return (
      <svg className="h-12 w-12 text-amber-500" viewBox="0 0 64 64" fill="none">
        <path
          d="M20 38a14 14 0 1 1 27.5-4.5A11 11 0 1 1 52 44H20a10 10 0 0 1 0-20c.5 0 1 .05 1.5.15A14 14 0 0 1 20 38Z"
          fill="currentColor"
          className="text-slate-400 dark:text-slate-500"
          opacity="0.9"
        />
        <path
          d="M32 36l-4 10h6l-3 10 9-13h-6l4-7h-6Z"
          fill="#f59e0b"
          stroke="#d97706"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (c.includes("雨")) {
    return (
      <svg className="h-12 w-12 text-blue-500" viewBox="0 0 64 64" fill="none">
        <path
          d="M20 34a14 14 0 1 1 27.5-4.5A11 11 0 1 1 52 40H20a10 10 0 0 1 0-20c.5 0 1 .05 1.5.15A14 14 0 0 1 20 34Z"
          fill="currentColor"
          className="text-slate-400 dark:text-slate-500"
          opacity="0.85"
        />
        <line x1="24" y1="44" x2="20" y2="54" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="34" y1="44" x2="30" y2="54" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
        <line x1="44" y1="44" x2="40" y2="54" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }

  if (c.includes("陰") || c.includes("雲")) {
    return (
      <svg className="h-12 w-12 text-slate-400" viewBox="0 0 64 64" fill="none">
        <circle cx="26" cy="24" r="10" fill="#f59e0b" opacity="0.8" />
        <path
          d="M20 38a14 14 0 1 1 27.5-4.5A11 11 0 1 1 52 44H20a10 10 0 0 1 0-20c.5 0 1 .05 1.5.15A14 14 0 0 1 20 38Z"
          fill="currentColor"
          className="text-slate-300 dark:text-slate-600"
        />
      </svg>
    );
  }

  // Sunny / Clear default
  return (
    <svg className="h-12 w-12 text-amber-500" viewBox="0 0 64 64" fill="none">
      <circle cx="32" cy="32" r="14" fill="#f59e0b" />
      <g stroke="#f59e0b" strokeWidth="3" strokeLinecap="round">
        <line x1="32" y1="6" x2="32" y2="12" />
        <line x1="32" y1="52" x2="32" y2="58" />
        <line x1="6" y1="32" x2="12" y2="32" />
        <line x1="52" y1="32" x2="58" y2="32" />
        <line x1="13.6" y1="13.6" x2="17.8" y2="17.8" />
        <line x1="46.2" y1="46.2" x2="50.4" y2="50.4" />
        <line x1="13.6" y1="50.4" x2="17.8" y2="46.2" />
        <line x1="46.2" y1="17.8" x2="50.4" y2="13.6" />
      </g>
    </svg>
  );
}

export default function LocalWeatherSvgWidget() {
  const [weather, setWeather] = useState<StationWeather | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchWeather = async (lat: number, lng: number) => {
      try {
        const res = await fetch(`/api/weather-nearby?lat=${lat}&lng=${lng}`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && data.stationWeather) {
          setWeather(data.stationWeather);
        }
      } catch (err) {
        console.warn("Local weather fetch failed:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(25.033, 121.5654), // Default Taipei
        { timeout: 8000 }
      );
    } else {
      fetchWeather(25.033, 121.5654);
    }

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          fetch(`/api/weather-nearby?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}`)
            .then((r) => r.json())
            .then((data) => {
              if (data.stationWeather) setWeather(data.stationWeather);
            })
            .finally(() => setLoading(false));
        },
        () => setLoading(false)
      );
    } else {
      setLoading(false);
    }
  };

  const locationTitle = weather
    ? `${weather.county_name || ""}${weather.town_name || ""} (${weather.station_name || "即時測站"})`
    : "在地區域天氣";

  return (
    <SidebarWidgetShell
      dotColorClass="bg-amber-500"
      title="📍 即時在地天氣"
      onRefresh={handleRefresh}
      refreshing={loading}
      showSpinner={loading && !weather}
      hasData={Boolean(weather)}
      emptyMessage="暫無測站即時天氣觀測資料"
      footerHref="/tools/rainfall"
      footerLabel="查詢全台即時降雨與測站 →"
    >
      {weather && (
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                {weather.air_temperature ? `${weather.air_temperature}°C` : "即時觀測"}
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {weather.weather || "舒適晴朗"}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              {locationTitle} · 距離約 {weather.distance_km}km
            </p>
            {weather.precipitation && Number(weather.precipitation) > 0 && (
              <p className="mt-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400">
                🌧️ 時雨量：{weather.precipitation} mm
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center justify-center">
            <WeatherSvgIcon condition={weather.weather} />
          </div>
        </div>
      )}
    </SidebarWidgetShell>
  );
}
