"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { YouBikeStation } from "@/lib/server/youbike/types";
import { useGeolocation, GEO_DEFAULTS } from "@/components/Facilities/useGeolocation";

const CITIES = [
  { code: "", label: "附近 3km" },
  { code: "TPE", label: "臺北市" },
  { code: "NTPC", label: "新北市" },
  { code: "TYCG", label: "桃園市" },
  { code: "HSC", label: "新竹市" },
  { code: "HCH", label: "新竹縣" },
  { code: "MAL", label: "苗栗縣" },
  { code: "TXG", label: "臺中市" },
  { code: "CYI", label: "嘉義市" },
  { code: "TNN", label: "臺南市" },
  { code: "KHH", label: "高雄市" },
  { code: "PTT", label: "屏東縣" },
];

export default function YoubikeContent({
  initialStations = [],
}: {
  initialStations?: YouBikeStation[];
}) {
  const location = useGeolocation();
  const [stations, setStations] = useState<YouBikeStation[]>(initialStations);
  const [loading, setLoading] = useState(false);
  const [selectedCity, setSelectedCity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [filterMode, setFilterMode] = useState<"all" | "bikes" | "spaces">("all");
  const initialFetchDone = useRef(false);

  const fetchStations = useCallback(
    async (params: { city?: string; kw?: string; lat?: number; lng?: number }) => {
      setLoading(true);
      try {
        const query = new URLSearchParams();
        if (params.city) query.set("city", params.city);
        if (params.kw) query.set("keyword", params.kw);
        if (params.lat !== undefined && params.lng !== undefined) {
          query.set("lat", String(params.lat));
          query.set("lng", String(params.lng));
          query.set("radius", "3000"); // 3km
        }
        query.set("limit", "100");

        const res = await fetch(`/api/youbike?${query.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.ok && Array.isArray(data.stations)) {
            setStations(data.stations);
          }
        }
      } catch (err) {
        console.error("Failed to fetch YouBike stations:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // 當定位完成（允許或逾時退回台北101）且尚未發起查詢時，自動帶出周圍 3km 站點
  useEffect(() => {
    if (!location.loading && !initialFetchDone.current) {
      initialFetchDone.current = true;
      fetchStations({
        city: selectedCity,
        kw: keyword,
        lat: location.lat,
        lng: location.lng,
      });
    }
  }, [location.loading, location.lat, location.lng, selectedCity, keyword, fetchStations]);

  const handleCityChange = (cityCode: string) => {
    setSelectedCity(cityCode);
    fetchStations({
      city: cityCode,
      kw: keyword,
      lat: cityCode ? undefined : location.lat,
      lng: cityCode ? undefined : location.lng,
    });
  };

  const handleKeywordSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStations({
      city: selectedCity,
      kw: keyword,
      lat: selectedCity ? undefined : location.lat,
      lng: selectedCity ? undefined : location.lng,
    });
  };

  const handleLocateMe = () => {
    setSelectedCity("");
    location.refresh();
    fetchStations({
      city: "",
      kw: keyword,
      lat: location.lat,
      lng: location.lng,
    });
  };

  const filteredStations = stations.filter((s) => {
    if (filterMode === "bikes" && s.availableBikes <= 0) return false;
    if (filterMode === "spaces" && s.emptySpaces <= 0) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Search and Control Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-100 text-xl dark:bg-yellow-900/50">
                🚲
              </span>
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  公共自行車即時站點車位 (YouBike 2.0)
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  全台多縣市即時站點查詢，即時掌握可借車輛數與可還空位。
                </p>
              </div>
            </div>

            <button
              onClick={handleLocateMe}
              disabled={location.loading || location.refreshing}
              className="flex items-center gap-1.5 rounded-xl bg-yellow-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-yellow-600 disabled:opacity-50"
            >
              <span>🧭</span>
              {location.loading || location.refreshing
                ? "定位中..."
                : location.isDefault
                ? "以 101 為中心 (點擊重測)"
                : "已定位 (點擊重測)"}
            </button>
          </div>

          {/* 台北 101 降級友善提示 */}
          {!location.loading && location.isDefault && (
            <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50/80 px-3.5 py-2 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300">
              <span className="flex items-center gap-1.5">
                <span>📍</span>
                <span>定位權限未開啟或逾時，目前已自動切換至<strong>台北 101</strong>周邊 3 公里站點。</span>
              </span>
              <button
                onClick={handleLocateMe}
                className="font-bold underline transition hover:text-amber-950 dark:hover:text-amber-100"
              >
                重試定位
              </button>
            </div>
          )}

          {/* City Selection Tabs */}
          <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            {CITIES.map((c) => (
              <button
                key={c.code}
                onClick={() => handleCityChange(c.code)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  selectedCity === c.code
                    ? "bg-yellow-500 text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Search Form */}
          <form onSubmit={handleKeywordSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="輸入站點名稱或路名（例：捷運中正紀念堂站、信義路）..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-yellow-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:focus:bg-slate-900"
              />
              {keyword && (
                <button
                  type="button"
                  onClick={() => {
                    setKeyword("");
                    fetchStations({
                      city: selectedCity,
                      kw: "",
                      lat: selectedCity ? undefined : location.lat,
                      lng: selectedCity ? undefined : location.lng,
                    });
                  }}
                  className="absolute right-3 top-2.5 text-xs text-slate-600 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
              >
                搜尋
              </button>

              <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => setFilterMode("all")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    filterMode === "all"
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                      : "text-slate-600"
                  }`}
                >
                  全部
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("bikes")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    filterMode === "bikes"
                      ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400"
                      : "text-slate-600"
                  }`}
                >
                  有車
                </button>
                <button
                  type="button"
                  onClick={() => setFilterMode("spaces")}
                  className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                    filterMode === "spaces"
                      ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                      : "text-slate-600"
                  }`}
                >
                  有空位
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Station Cards Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 px-1">
          <span>
            共找到 <strong className="text-slate-800 dark:text-slate-200">{filteredStations.length}</strong> 個站點
          </span>
          {!selectedCity && !location.loading && (
            <span className="text-emerald-600 dark:text-emerald-400">已依距離由近到遠排序</span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
            <p className="mt-3 text-sm">正在查詢即時站點資料庫...</p>
          </div>
        ) : filteredStations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="text-4xl">🚲</span>
            <h3 className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-200">
              查無符合條件的 YouBike 站點
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              請試著切換縣市、清除關鍵字或擴大搜尋半徑。
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStations.map((station) => {
              const bikeRatio =
                station.totalSpaces > 0 ? station.availableBikes / station.totalSpaces : 0;
              let statusBadge = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
              let statusText = "車輛充足";
              if (station.availableBikes === 0) {
                statusBadge = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800";
                statusText = "無車可借";
              } else if (bikeRatio < 0.2) {
                statusBadge = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
                statusText = "車輛偏少";
              }

              return (
                <div
                  key={`${station.cityCode}_${station.stationNo}`}
                  className="relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-yellow-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-yellow-700"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {station.cityCode === "TPE"
                            ? "臺北"
                            : station.cityCode === "NTPC"
                            ? "新北"
                            : "新竹"}
                        </span>
                        {station.districtTw && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {station.districtTw}
                          </span>
                        )}
                        {station.distanceKm !== undefined && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                            距您 {station.distanceKm} km
                          </span>
                        )}
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge}`}>
                        {statusText}
                      </span>
                    </div>

                    <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                      {station.nameTw}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                      {station.addressTw || "無詳細地址資訊"}
                    </p>
                  </div>

                  {/* Meter section */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="grid grid-cols-2 gap-3 text-center">
                      <div className="rounded-xl bg-emerald-50/70 p-2.5 dark:bg-emerald-950/20">
                        <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
                          {station.availableBikes}
                        </div>
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          可借車輛
                        </div>
                        {station.availableEbikes > 0 && (
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
                            ⚡含電輔車 {station.availableEbikes} 台
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl bg-blue-50/70 p-2.5 dark:bg-blue-950/20">
                        <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                          {station.emptySpaces}
                        </div>
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          可還空位
                        </div>
                        <div className="text-[10px] text-slate-600">
                          總車格 {station.totalSpaces}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-50 dark:border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <span>更新：{station.updatedAtSource?.slice(11, 16) || "即時"}</span>
                        {(() => {
                          if (!station.updatedAtSource) return null;
                          const t = new Date(station.updatedAtSource).getTime();
                          if (!isNaN(t) && Date.now() - t > 15 * 60 * 1000) {
                            return (
                              <span className="rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-medium text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                更新延遲
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      {station.lat && station.lng && (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${station.lat},${station.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-medium text-yellow-600 hover:text-yellow-700 dark:text-yellow-400"
                        >
                          <span>🗺️ 導航路線</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
