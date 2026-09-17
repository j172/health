"use client";

import { useEffect, useState, useCallback } from "react";
import SidebarWidgetShell from "./SidebarWidgetShell";
import { useGeolocation, getSavedLocation } from "@/components/Facilities/useGeolocation";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";

export const TAIWAN_COUNTIES = [
  { name: "基隆市", lat: 25.1276, lng: 121.7392 },
  { name: "臺北市", lat: 25.0330, lng: 121.5654 },
  { name: "新北市", lat: 25.0169, lng: 121.4627 },
  { name: "桃園市", lat: 24.9936, lng: 121.3010 },
  { name: "新竹市", lat: 24.8138, lng: 120.9675 },
  { name: "新竹縣", lat: 24.8387, lng: 121.0177 },
  { name: "苗栗縣", lat: 24.5602, lng: 120.8214 },
  { name: "臺中市", lat: 24.1477, lng: 120.6736 },
  { name: "彰化縣", lat: 24.0518, lng: 120.5161 },
  { name: "南投縣", lat: 23.9609, lng: 120.9719 },
  { name: "雲林縣", lat: 23.7092, lng: 120.4313 },
  { name: "嘉義市", lat: 23.4800, lng: 120.4491 },
  { name: "嘉義縣", lat: 23.4518, lng: 120.2559 },
  { name: "臺南市", lat: 22.9997, lng: 120.2270 },
  { name: "高雄市", lat: 22.6273, lng: 120.3014 },
  { name: "屏東縣", lat: 22.5519, lng: 120.5487 },
  { name: "宜蘭縣", lat: 24.7021, lng: 121.7377 },
  { name: "花蓮縣", lat: 23.9872, lng: 121.6016 },
  { name: "臺東縣", lat: 22.7583, lng: 121.1444 },
  { name: "澎湖縣", lat: 23.5711, lng: 119.5793 },
  { name: "金門縣", lat: 24.4493, lng: 118.3766 },
  { name: "連江縣", lat: 26.1602, lng: 119.9515 },
];

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
          className="text-slate-600 dark:text-slate-500"
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
          className="text-slate-600 dark:text-slate-500"
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
      <svg className="h-12 w-12 text-slate-600" viewBox="0 0 64 64" fill="none">
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
  const geo = useGeolocation();
  const [weather, setWeather] = useState<StationWeather | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCounty, setSelectedCounty] = useState<string>(() => {
    const saved = getSavedLocation();
    return saved?.name ?? "auto";
  });

  const fetchWeather = useCallback(async (lat: number, lng: number) => {
    setLoading(true);
    try {
      const res = await fetchWithTimeout(`/api/weather-nearby?lat=${lat}&lng=${lng}`, { timeoutMs: 5000 });
      if (!res.ok) return;
      const data = await res.json();
      if (data.stationWeather) {
        setWeather(data.stationWeather);
      }
    } catch (err) {
      console.warn("Local weather fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWeather(geo.lat, geo.lng);
  }, [geo.lat, geo.lng, fetchWeather]);

  const handleCountyChange = (countyName: string) => {
    setSelectedCounty(countyName);
    if (countyName === "auto") {
      try {
        localStorage.removeItem("user_selected_location");
      } catch {}
      geo.refresh();
      return;
    }

    const found = TAIWAN_COUNTIES.find((c) => c.name === countyName);
    if (found) {
      try {
        localStorage.setItem("user_selected_location", JSON.stringify(found));
      } catch {}
      window.dispatchEvent(
        new CustomEvent("user-location-change", { detail: { lat: found.lat, lng: found.lng } }),
      );
      fetchWeather(found.lat, found.lng);
    }
  };

  const handleRefresh = () => {
    if (selectedCounty === "auto") {
      geo.refresh();
    } else {
      const found = TAIWAN_COUNTIES.find((c) => c.name === selectedCounty);
      if (found) fetchWeather(found.lat, found.lng);
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
      refreshing={loading || geo.refreshing}
      showSpinner={loading && !weather}
      hasData={Boolean(weather)}
      emptyMessage="暫無測站即時天氣觀測資料"
      footerHref="/tools/weather-alerts"
      footerLabel="查詢全台即時降雨與測站 →"
    >
      {weather && (
        <div>
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
              <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
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

          <div className="mt-2.5 flex items-center justify-between gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">切換地區：</span>
              <select
                aria-label="選擇所在縣市"
                value={selectedCounty}
                onChange={(e) => handleCountyChange(e.target.value)}
                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:border-amber-400 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="auto">🎯 GPS 自動定位</option>
                {TAIWAN_COUNTIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {geo.isDefault && selectedCounty === "auto" && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400" title="定位權限未開啟，顯示臺北101">
                (顯示臺北101)
              </span>
            )}
          </div>
        </div>
      )}
    </SidebarWidgetShell>
  );
}
