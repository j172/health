"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import type { YouBikeStation } from "@/lib/server/youbike/types";
import { useSharedGeolocation } from "@/lib/hooks/useSharedGeolocation";
import { GEO_DEFAULTS } from "@/lib/constants/geoDefaults";
import MapLocationBanner from "@/components/Common/MapLocationBanner";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildGoogleMapsDirUrl, getNavigationButtonLabel } from "@/lib/utils/mapNavigation";

// 「更新延遲」徽章的門檻。臺北市／新北市每 5 分鐘從開放資料更新，超過 15 分鐘沒動就是漏了兩輪以上；
// 其餘縣市改由 TDX 約每 15 分鐘更新一輪（一輪約 3 分鐘，再加上來源自己的時間差，正常情況下最舊的
// 一筆約 20 分鐘），沿用 15 分鐘會讓正常狀態下每個週期都有一段時間誤標「更新延遲」，所以放寬為 30 分鐘
// （漏掉一整輪時約 35 分鐘，仍會標出來）。
const DIRECT_CITY_CODES = ["TPE", "NTPC"];
const staleAfterMs = (cityCode: string): number =>
  (DIRECT_CITY_CODES.includes(cityCode) ? 15 : 30) * 60 * 1000;

// 與 lib/server/youbike/tdxClient.ts 的 TDX_CITIES 保持一致（issue #453：由 11
// 個縣市擴充為 TDX 涵蓋的全部 15 個）。此處是 client component，無法直接 import
// server-only 的 tdxClient.ts，故維持獨立的一份對照表。
//
// issue #486: county/city names here are real-world place names — same
// "government/dynamic data, never machine-translated" rule issue #485
// applied to station names/addresses — so CITIES[].label and
// CITY_SHORT_LABELS stay in Chinese verbatim across all locales (this also
// matches lib/i18n/toolContent.ts's own ja/ko "youbike" FAQ answers, which
// keep these same county names in Chinese even in otherwise-Japanese/Korean
// text). Only the one synthetic, non-place-name entry ("附近 3km") is a UI
// label and goes through t().
const CITIES = [
  { code: "", labelKey: "youbikeTool.cityNearby", label: "附近 3km" },
  { code: "TPE", label: "臺北市" },
  { code: "NTPC", label: "新北市" },
  { code: "TYCG", label: "桃園市" },
  { code: "HSC", label: "新竹市" },
  { code: "HCH", label: "新竹縣" },
  { code: "MAL", label: "苗栗縣" },
  { code: "TXG", label: "臺中市" },
  { code: "CHA", label: "彰化縣" },
  { code: "YUN", label: "雲林縣" },
  { code: "CYI", label: "嘉義市" },
  { code: "CYQ", label: "嘉義縣" },
  { code: "TNN", label: "臺南市" },
  { code: "KHH", label: "高雄市" },
  { code: "PTT", label: "屏東縣" },
  { code: "TTT", label: "臺東縣" },
];

// code -> 短標籤（站卡上的縣市徽章用，比完整 label 更精簡），供下方站點卡片查表
// 使用，取代舊版只認得臺北/新北、其餘全部誤標為「新竹」的寫死三元判斷。
// 同上：縣市名稱屬地名／政府資料性質，不做機器翻譯。
const CITY_SHORT_LABELS: Record<string, string> = {
  TPE: "臺北",
  NTPC: "新北",
  TYCG: "桃園",
  HSC: "新竹市",
  HCH: "新竹縣",
  MAL: "苗栗",
  TXG: "臺中",
  CHA: "彰化",
  YUN: "雲林",
  CYI: "嘉義市",
  CYQ: "嘉義縣",
  TNN: "臺南",
  KHH: "高雄",
  PTT: "屏東",
  TTT: "臺東",
};

export default function YoubikeContent({
  initialStations = [],
}: {
  initialStations?: YouBikeStation[];
}) {
  const { locale, t } = useLanguage();
  const geolocation = useSharedGeolocation();
  const locationPending = geolocation.status === "locating" || geolocation.status === "awaiting-permission";
  // 雙軌即時渲染（延續既有行為）：還沒有 GPS 座標時先以臺北101為暫時中心點
  // 立即顯示站點，不讓使用者乾等 GPS 授權彈窗；GPS 座標一旦到位就會接手。拒
  // 絕/逾時/不支援時下方 MapLocationBanner 會指向上面既有的縣市分類頁籤，不
  // 會讓使用者誤以為臺北101就是他的位置。
  const mapOrigin = geolocation.coords ?? GEO_DEFAULTS;
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

        const res = await fetchWithTimeout(`/api/youbike?${query.toString()}`, { timeoutMs: 5000 });
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

  // 雙軌即時渲染：初次載入立即以當前座標（GPS 或臺北101）發起查詢，不用乾等 GPS 授權視窗
  useEffect(() => {
    // Deferred via queueMicrotask (see lib/hooks/useSharedGeolocation.ts's
    // own mount effect / docs/archive/specs/set-state-in-effect-fix.md,
    // issue #121/#122): fetchStations() calls setState synchronously, which
    // trips react-hooks/set-state-in-effect when called directly from an
    // effect body.
    queueMicrotask(() => {
      if (!initialFetchDone.current) {
        initialFetchDone.current = true;
        fetchStations({
          city: selectedCity,
          kw: keyword,
          lat: mapOrigin.lat,
          lng: mapOrigin.lng,
        });
        return;
      }

      // 若使用者未手動選擇特定縣市或關鍵字，且 GPS 座標更新了，則平滑刷新周圍站點
      if (!selectedCity && !keyword && geolocation.coords) {
        fetchStations({
          lat: geolocation.coords.lat,
          lng: geolocation.coords.lng,
        });
      }
    });
  }, [geolocation.coords, selectedCity, keyword, fetchStations, mapOrigin]);

  const handleCityChange = (cityCode: string) => {
    setSelectedCity(cityCode);
    fetchStations({
      city: cityCode,
      kw: keyword,
      lat: cityCode ? undefined : mapOrigin.lat,
      lng: cityCode ? undefined : mapOrigin.lng,
    });
  };

  const handleKeywordSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchStations({
      city: selectedCity,
      kw: keyword,
      lat: selectedCity ? undefined : mapOrigin.lat,
      lng: selectedCity ? undefined : mapOrigin.lng,
    });
  };

  const handleLocateMe = () => {
    setSelectedCity("");
    geolocation.refresh();
    fetchStations({
      city: "",
      kw: keyword,
      lat: mapOrigin.lat,
      lng: mapOrigin.lng,
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
                  {t("youbikeTool.heading", "公共自行車即時站點車位 (YouBike 2.0)")}
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {t("youbikeTool.subheading", "全台多縣市即時站點查詢，即時掌握可借車輛數與可還空位。")}
                </p>
              </div>
            </div>

            <button
              onClick={handleLocateMe}
              disabled={locationPending}
              className="flex items-center gap-1.5 rounded-xl bg-yellow-500 px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-yellow-600 disabled:opacity-50"
            >
              <span>🧭</span>
              {locationPending
                ? t("youbikeTool.locating", "定位中...")
                : !geolocation.coords
                ? t("youbikeTool.centerDefault", "以 101 為中心 (點擊重測)")
                : t("youbikeTool.locatedRetap", "已定位 (點擊重測)")}
            </button>
          </div>

          <MapLocationBanner
            geolocation={geolocation}
            hasManualCoords={Boolean(selectedCity)}
            showPicker={false}
            facilityTypeName={t("youbikeTool.facilityTypeName", "YouBike 站點")}
          />

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
                {"labelKey" in c ? t(c.labelKey as string, c.label) : c.label}
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
                placeholder={t(
                  "youbikeTool.searchPlaceholder",
                  "輸入站點名稱或路名（例：捷運中正紀念堂站、信義路）..."
                )}
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
                      lat: selectedCity ? undefined : mapOrigin.lat,
                      lng: selectedCity ? undefined : mapOrigin.lng,
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
                {t("youbikeTool.searchButton", "搜尋")}
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
                  {t("youbikeTool.filterAll", "全部")}
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
                  {t("youbikeTool.filterHasBikes", "有車")}
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
                  {t("youbikeTool.filterHasSpaces", "有空位")}
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
            {t("youbikeTool.foundCountTemplate", "共找到 {count} 個站點").replace(
              "{count}",
              String(filteredStations.length)
            )}
          </span>
          {!selectedCity && !locationPending && (
            <span className="text-emerald-600 dark:text-emerald-400">
              {t("youbikeTool.sortedByDistance", "已依距離由近到遠排序")}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
            <p className="mt-3 text-sm">{t("youbikeTool.loadingStations", "正在查詢即時站點資料庫...")}</p>
          </div>
        ) : filteredStations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="text-4xl">🚲</span>
            <h3 className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-200">
              {t("youbikeTool.noResultsHeading", "查無符合條件的 YouBike 站點")}
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {t("youbikeTool.noResultsDesc", "請試著切換縣市、清除關鍵字或擴大搜尋半徑。")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredStations.map((station) => {
              const bikeRatio =
                station.totalSpaces > 0 ? station.availableBikes / station.totalSpaces : 0;
              let statusBadge = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
              let statusText = t("youbikeTool.statusSufficient", "車輛充足");
              if (station.availableBikes === 0) {
                statusBadge = "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800";
                statusText = t("youbikeTool.statusNone", "無車可借");
              } else if (bikeRatio < 0.2) {
                statusBadge = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800";
                statusText = t("youbikeTool.statusLow", "車輛偏少");
              }

              return (
                <div
                  key={`${station.cityCode}_${station.stationNo}`}
                  className="relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-yellow-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-yellow-700"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {/* issue #486: county/city short label is government
                            place-name data — kept verbatim in Chinese, same
                            as station name/district below (see the CITIES
                            comment above). */}
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {CITY_SHORT_LABELS[station.cityCode] || station.cityCode}
                        </span>
                        {station.districtTw && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {station.districtTw}
                          </span>
                        )}
                        {station.distanceKm !== undefined && (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
                            {t("youbikeTool.distanceTemplate", "距您 {value} km").replace(
                              "{value}",
                              String(station.distanceKm)
                            )}
                          </span>
                        )}
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge}`}>
                        {statusText}
                      </span>
                    </div>

                    {/* issue #486: station name/address are live government
                        data (TDX feed), never machine-translated — same rule
                        AedContent.tsx follows for facility names/addresses. */}
                    <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-white">
                      {station.nameTw}
                    </h3>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-1">
                      {station.addressTw || t("youbikeTool.noAddressInfo", "無詳細地址資訊")}
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
                          {t("youbikeTool.availableBikesLabel", "可借車輛")}
                        </div>
                        {station.availableEbikes > 0 && (
                          <div className="text-[10px] text-emerald-700 dark:text-emerald-300 font-medium">
                            {t("youbikeTool.ebikeCountTemplate", "⚡含電輔車 {count} 台").replace(
                              "{count}",
                              String(station.availableEbikes)
                            )}
                          </div>
                        )}
                      </div>

                      <div className="rounded-xl bg-blue-50/70 p-2.5 dark:bg-blue-950/20">
                        <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                          {station.emptySpaces}
                        </div>
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                          {t("youbikeTool.emptySpacesLabel", "可還空位")}
                        </div>
                        <div className="text-[10px] text-slate-600">
                          {t("youbikeTool.totalSpacesTemplate", "總車格 {count}").replace(
                            "{count}",
                            String(station.totalSpaces)
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-600 pt-2 border-t border-slate-50 dark:border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <span>
                          {t("youbikeTool.updatedAtTemplate", "更新：{time}").replace(
                            "{time}",
                            station.updatedAtSource?.slice(11, 16) || t("youbikeTool.liveNow", "即時")
                          )}
                        </span>
                        {(() => {
                          if (!station.updatedAtSource) return null;
                          const t2 = new Date(station.updatedAtSource).getTime();
                          if (!isNaN(t2) && Date.now() - t2 > staleAfterMs(station.cityCode)) {
                            return (
                              <span className="rounded bg-amber-50 px-1.5 py-0.2 text-[10px] font-medium text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
                                {t("youbikeTool.updateDelayedBadge", "更新延遲")}
                              </span>
                            );
                          }
                          return null;
                        })()}
                      </div>
                      {station.lat && station.lng && (
                        <a
                          href={buildGoogleMapsDirUrl({
                            name: station.nameTw,
                            address: station.addressTw,
                            lat: station.lat,
                            lng: station.lng,
                          })}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-yellow-200 bg-yellow-50/50 px-2.5 py-1 text-xs font-semibold text-yellow-700 hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300"
                        >
                          <span>{getNavigationButtonLabel(locale)}</span>
                          <span className="text-[10px]">↗</span>
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
