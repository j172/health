"use client";

import { useEffect, useState } from "react";
import type {
  NearestRainfallOverview,
  TopRainfallStation,
} from "@/lib/server/cwa/queries";

const TAIWAN_COUNTIES = [
  "臺北市",
  "新北市",
  "基隆市",
  "桃園市",
  "新竹市",
  "新竹縣",
  "苗栗縣",
  "臺中市",
  "彰化縣",
  "南投縣",
  "雲林縣",
  "嘉義市",
  "嘉義縣",
  "臺南市",
  "高雄市",
  "屏東縣",
  "宜蘭縣",
  "花蓮縣",
  "臺東縣",
  "澎湖縣",
  "金門縣",
  "連江縣",
];

const formatRainValue = (val: string | number | null | undefined): string => {
  if (val == null || val === "" || val === "-99" || val === "-999") return "0.0";
  const num = typeof val === "number" ? val : parseFloat(String(val));
  return isNaN(num) || num < 0 ? "0.0" : num.toFixed(1);
};

const getRainIntensityBadge = (mm24: number, mm1: number) => {
  if (mm24 >= 500) {
    return {
      label: "超大豪雨",
      bg: "bg-purple-600 text-white",
      border: "border-purple-300 dark:border-purple-800",
    };
  }
  if (mm24 >= 350 || mm1 >= 200) {
    return {
      label: "大豪雨",
      bg: "bg-red-600 text-white",
      border: "border-red-300 dark:border-red-800",
    };
  }
  if (mm24 >= 200 || mm1 >= 100) {
    return {
      label: "豪雨",
      bg: "bg-orange-500 text-white",
      border: "border-orange-300 dark:border-orange-800",
    };
  }
  if (mm24 >= 80 || mm1 >= 40) {
    return {
      label: "大雨",
      bg: "bg-amber-500 text-white",
      border: "border-amber-300 dark:border-amber-800",
    };
  }
  if (mm1 >= 10 || mm24 >= 20) {
    return {
      label: "中雨",
      bg: "bg-sky-500 text-white",
      border: "border-sky-300 dark:border-sky-800",
    };
  }
  if (mm1 > 0 || mm24 > 0) {
    return {
      label: "小雨",
      bg: "bg-emerald-500 text-white",
      border: "border-emerald-300 dark:border-emerald-800",
    };
  }
  return {
    label: "無明顯降雨",
    bg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
  };
};

export default function WeatherRainfallLocator({
  initialTopStations = [],
}: {
  initialTopStations?: TopRainfallStation[];
}) {
  const [locating, setLocating] = useState(false);
  const [selectedCounty, setSelectedCounty] = useState("");
  const [locationName, setLocationName] = useState<string | null>(null);
  const [rainfallData, setRainfallData] = useState<NearestRainfallOverview | null>(null);
  const [topStations, setTopStations] = useState<TopRainfallStation[]>(initialTopStations);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRainfall = async (params: { lat?: number; lng?: number; county?: string }) => {
    setLocating(true);
    setErrorMsg(null);
    try {
      const query = new URLSearchParams();
      if (params.lat != null && params.lng != null) {
        query.set("lat", String(params.lat));
        query.set("lng", String(params.lng));
      }
      if (params.county) {
        query.set("county", params.county);
      }

      const res = await fetch(`/api/weather/rainfall?${query.toString()}`);
      const json = await res.json();

      if (json.success && json.data) {
        setRainfallData(json.data.nearest);
        if (json.data.topStations) {
          setTopStations(json.data.topStations);
        }
      } else {
        setErrorMsg("無法取得該區域雨量資訊，請稍後再試。");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("連線失敗，請檢查網路狀態。");
    } finally {
      setLocating(false);
    }
  };

  const handleGeoLocate = () => {
    if (!navigator.geolocation) {
      setErrorMsg("您的瀏覽器不支援 GPS 地理定位。");
      return;
    }
    setLocating(true);
    setErrorMsg(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLocationName("您的目前位置");
        setSelectedCounty("");
        fetchRainfall({ lat: latitude, lng: longitude });
      },
      (error) => {
        console.warn("Geolocation error:", error);
        setLocating(false);
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMsg("未取得定位權限，您可直接選擇縣市查詢。");
        } else {
          setErrorMsg("定位失敗，請手動選擇縣市。");
        }
      },
      { timeout: 10000, enableHighAccuracy: false },
    );
  };

  const handleCountyChange = (county: string) => {
    setSelectedCounty(county);
    setLocationName(county);
    if (county) {
      fetchRainfall({ county });
    }
  };

  // Initial load: attempt GPS geolocation, otherwise fallback to Taipei
  useEffect(() => {
    let active = true;

    if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!active) return;
          setLocationName("您的目前位置");
          fetchRainfall({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {
          if (!active) return;
          setSelectedCounty("臺北市");
          setLocationName("臺北市");
          fetchRainfall({ county: "臺北市" });
        },
        { timeout: 6000, enableHighAccuracy: false },
      );
    } else {
      const timer = setTimeout(() => {
        if (!active) return;
        setSelectedCounty("臺北市");
        setLocationName("臺北市");
        fetchRainfall({ county: "臺北市" });
      }, 0);
      return () => {
        active = false;
        clearTimeout(timer);
      };
    }

    return () => {
      active = false;
    };
  }, []);

  const realtime = rainfallData?.realtime;
  const accumulation = rainfallData?.accumulation;
  const mm24 = parseFloat(realtime?.precip_24hr || "0") || 0;
  const mm1 = parseFloat(realtime?.precip_1hr || "0") || 0;
  const badge = getRainIntensityBadge(mm24, mm1);

  return (
    <div className="space-y-6">
      {/* Controls: GPS button + County selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100">
            🌧️ 即時雨量觀測站定位
          </h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            自動連線中央氣象署 1,300+ 座自動雨量站 (O-A0002-001) 與 38 署屬氣象站歷史統計 (C-B0025-001)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleGeoLocate}
            disabled={locating}
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2 text-xs font-semibold text-indigo-700 shadow-xs transition-colors hover:bg-indigo-100 disabled:opacity-50 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 dark:hover:bg-indigo-900/80"
          >
            <span className={locating ? "animate-spin" : ""}>📍</span>
            <span>{locating ? "定位查詢中..." : "GPS 重新定位"}</span>
          </button>

          <select
            value={selectedCounty}
            onChange={(e) => handleCountyChange(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-xs focus:border-indigo-500 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            aria-label="選擇縣市"
          >
            <option value="">-- 手動切換縣市 --</option>
            {TAIWAN_COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Main Grid: Nearest Station Card & Top 5 Leaderboard */}
      <div className="grid gap-5 md:grid-cols-3">
        {/* Left: Nearest Station (2 columns) */}
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-xs md:col-span-2 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {realtime?.station_name || "測站連線中..."}
                </span>
                <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {realtime?.station_id || "--"}
                </span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.bg}`}>
                  {badge.label}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                📍 位於 {realtime?.county_name || ""}{realtime?.town_name || ""}
                {realtime?.distance_km != null && (
                  <span className="ml-1 font-semibold text-indigo-600 dark:text-indigo-400">
                    （距離約 {realtime.distance_km.toFixed(1)} km）
                  </span>
                )}
                {locationName && ` · 參考基準：${locationName}`}
              </p>
            </div>
            {realtime?.obs_time && (
              <span className="text-[11px] text-slate-400">
                觀測時間：{new Date(realtime.obs_time).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          {/* Realtime Accumulation stats (O-A0002-001) */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800/80 dark:bg-slate-850">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">時雨量 (1小時)</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatRainValue(realtime?.precip_1hr)} <span className="text-xs font-normal text-slate-400">mm</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800/80 dark:bg-slate-850">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">3小時累積</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatRainValue(realtime?.precip_3hr)} <span className="text-xs font-normal text-slate-400">mm</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800/80 dark:bg-slate-850">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">24小時累積 (日雨量)</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                {formatRainValue(realtime?.precip_24hr)} <span className="text-xs font-normal text-slate-400">mm</span>
              </p>
            </div>

            <div className="rounded-xl border border-slate-100 bg-white p-3 dark:border-slate-800/80 dark:bg-slate-850">
              <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">3天累積雨量</p>
              <p className="mt-1 font-mono text-xl font-extrabold text-slate-900 dark:text-slate-100">
                {formatRainValue(realtime?.precip_3days)} <span className="text-xs font-normal text-slate-400">mm</span>
              </p>
            </div>
          </div>

          {/* Historical Accumulation stats (C-B0025-001) */}
          <div className="mt-4 rounded-xl border border-slate-200/70 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
              <span>📊 氣象站中長期累積歷史 (C-B0025-001)：{accumulation?.station_name || "署屬測站"}</span>
              {accumulation?.distance_km != null && (
                <span className="text-[11px] text-slate-400">
                  距約 {accumulation.distance_km.toFixed(1)} km
                </span>
              )}
            </div>
            <div className="mt-2.5 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-white p-2 shadow-2xs dark:bg-slate-800">
                <span className="text-slate-500 dark:text-slate-400">本月累積雨量</span>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                  {accumulation?.month_mm != null ? accumulation.month_mm.toFixed(1) : "--"} mm
                </p>
              </div>
              <div className="rounded-lg bg-white p-2 shadow-2xs dark:bg-slate-800">
                <span className="text-slate-500 dark:text-slate-400">本年度累積雨量</span>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                  {accumulation?.year_mm != null ? accumulation.year_mm.toFixed(1) : "--"} mm
                </p>
              </div>
              <div className="rounded-lg bg-white p-2 shadow-2xs dark:bg-slate-800">
                <span className="text-slate-500 dark:text-slate-400">近30天降雨日</span>
                <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                  {accumulation?.wet_days_30 != null ? `${accumulation.wet_days_30} 天` : "--"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Top 5 24hr Rainfall Leaderboard */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
            <h4 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">
              🏆 全台 24H 雨量排行
            </h4>
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
              降雨熱區
            </span>
          </div>

          <div className="mt-3 space-y-2.5">
            {topStations.length > 0 ? (
              topStations.slice(0, 5).map((st, idx) => {
                const rain24 = parseFloat(st.precip_24hr || "0") || 0;
                return (
                  <div
                    key={st.station_id}
                    className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs dark:bg-slate-800/60"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                          idx === 0
                            ? "bg-amber-500 text-white"
                            : idx === 1
                              ? "bg-slate-400 text-white"
                              : idx === 2
                                ? "bg-amber-700 text-white"
                                : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300"
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-bold text-slate-800 dark:text-slate-200">
                          {st.station_name}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {st.county_name} {st.town_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                        {rain24.toFixed(1)}
                      </span>
                      <span className="text-[10px] text-slate-400"> mm</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-4 text-center text-xs text-slate-400">
                目前全台各地降雨均未達顯著累積量。
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
