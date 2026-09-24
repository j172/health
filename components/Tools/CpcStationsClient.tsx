"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { useGeolocation, GEO_DEFAULTS } from "@/components/Facilities/useGeolocation";
import MapLocationBanner from "@/components/Common/MapLocationBanner";
import type { CpcStationItem } from "@/lib/server/cpc/stations";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildGoogleMapsDirUrl, getNavigationButtonLabel } from "@/lib/utils/mapNavigation";

const CpcStationMap = dynamic(() => import("@/components/Tools/CpcStationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-sm text-slate-600">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent"></span>
        地圖載入中...
      </div>
    </div>
  ),
});

interface CpcStationsClientProps {
  initialStations: CpcStationItem[];
  allServices: string[];
}

const FUEL_TYPE_LABELS: Record<string, string> = {
  unleaded92: "無鉛92",
  unleaded95: "無鉛95",
  unleaded98: "無鉛98",
  alcoholGasoline: "酒精汽油",
  kerosene: "煤油",
  superDiesel: "超柴",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  memberCard: "會員卡",
  selfServiceCard: "刷卡自助",
  eInvoice: "電子發票",
  easyCard: "悠遊卡",
  iPassCard: "一卡通",
  happyCash: "HappyCash",
  selfServeDieselStation: "自助柴油站",
};

const QUICK_FILTERS = [
  { id: "wash", label: "🧽 洗車服務", service: "洗車服務" },
  { id: "selfGas", label: "⛽ 自助汽油", service: "自助汽油" },
  { id: "evCar", label: "⚡ 汽車充電", service: "汽車充電" },
  { id: "motoSwap", label: "🛵 機車換電", service: "電動機車換電" },
  { id: "cupgo", label: "☕ 來速咖啡", service: "Cup Go 咖啡" },
  { id: "easycard", label: "💳 悠遊卡", service: "悠遊卡" },
  { id: "ipass", label: "💳 一卡通", service: "一卡通" },
  { id: "inflation", label: "💨 輪胎充氣/打氣", service: "數位電子打氣機" },
];

export default function CpcStationsClient({
  initialStations,
  allServices,
}: CpcStationsClientProps) {
  const { locale } = useLanguage();
  const geo = useGeolocation();
  const [userLocation, setUserLocation] = useState({
    lat: GEO_DEFAULTS.lat,
    lng: GEO_DEFAULTS.lng,
    isDefault: true,
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [showAllServicesPanel, setShowAllServicesPanel] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [sortByDistance, setSortByDistance] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // Update user location from hook
  useEffect(() => {
    if (geo.lat && geo.lng) {
      queueMicrotask(() => {
        setUserLocation({
          lat: geo.lat,
          lng: geo.lng,
          isDefault: geo.isDefault,
        });
        if (!geo.isDefault) {
          setSortByDistance(true);
        }
      });
    }
  }, [geo.lat, geo.lng, geo.isDefault]);

  // Haversine distance calculator
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  };

  // Toggle a single service in filter
  const toggleService = (svc: string) => {
    setSelectedServices((prev) =>
      prev.includes(svc) ? prev.filter((s) => s !== svc) : [...prev, svc],
    );
    setPage(1);
  };

  const clearFilters = () => {
    setSelectedServices([]);
    setSearchQuery("");
    setPage(1);
  };

  // Filtered and sorted stations
  const filteredStations = useMemo(() => {
    let list = initialStations.map((st) => {
      let dist = st.distance_km;
      if (st.lat && st.lng && userLocation.lat && userLocation.lng) {
        dist = haversineDistance(userLocation.lat, userLocation.lng, st.lat, st.lng);
      }
      return { ...st, distance_km: dist };
    });

    // Keyword filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (st) =>
          st.name.toLowerCase().includes(q) ||
          (st.address && st.address.toLowerCase().includes(q)) ||
          (st.extra_json?.stationCode && st.extra_json.stationCode.toLowerCase().includes(q)),
      );
    }

    // Services intersection filter (AND)
    if (selectedServices.length > 0) {
      list = list.filter((st) => {
        const services = st.extra_json?.services || [];
        return selectedServices.every((req) => services.includes(req));
      });
    }

    // Sort
    if (sortByDistance) {
      list.sort((a, b) => (a.distance_km ?? 99999) - (b.distance_km ?? 99999));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    }

    return list;
  }, [initialStations, searchQuery, selectedServices, sortByDistance, userLocation]);

  const paginatedStations = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredStations.slice(start, start + pageSize);
  }, [filteredStations, page, pageSize]);

  const totalPages = Math.ceil(filteredStations.length / pageSize);

  return (
    <div className="space-y-6">
      {/* Top Filter and Geolocation Bar */}
      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
              全台中油加油站服務據點搜尋
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              共收錄 {initialStations.length} 座站點，提供 20 大便民服務即時多選篩選
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (navigator.geolocation) {
                  navigator.geolocation.getCurrentPosition(
                    (pos) => {
                      setUserLocation({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        isDefault: false,
                      });
                      setSortByDistance(true);
                    },
                    (err) => console.warn(err),
                  );
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
            >
              <span>📍 定位附近加油站</span>
            </button>

            <button
              type="button"
              onClick={() => setSortByDistance(!sortByDistance)}
              className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                sortByDistance
                  ? "bg-emerald-600 text-white dark:bg-emerald-500"
                  : "border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {sortByDistance ? "✓ 已按距離由近到遠" : "按距離排序"}
            </button>
          </div>
        </div>

        <MapLocationBanner location={geo} facilityTypeName="中油加油站" />

        {/* Search Input */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            placeholder="輸入站名（如：萬里站、草屯站）、縣市行政區或路名..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 shadow-sm focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:focus:bg-slate-800"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3.5 top-3 text-xs text-slate-600 hover:text-slate-600 dark:hover:text-slate-200"
            >
              清除
            </button>
          )}
        </div>

        {/* Quick Filter Pills */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
              熱門服務快捷篩選：
            </span>
            <button
              type="button"
              onClick={() => setShowAllServicesPanel(!showAllServicesPanel)}
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              {showAllServicesPanel ? "收合全部 20 項細部服務 ▲" : "展開全部 20 項細部服務 ▼"}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK_FILTERS.map((q) => {
              const isSelected = selectedServices.includes(q.service);
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => toggleService(q.service)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                    isSelected
                      ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30 dark:bg-blue-500"
                      : "border border-slate-200/90 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  {q.label}
                </button>
              );
            })}
          </div>

          {/* Full Services Filter Panel (Expandable) */}
          {showAllServicesPanel && (
            <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/50">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
                <span>勾選欲篩選的服務項目（支援多項同時符合）：</span>
                {selectedServices.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedServices([])}
                    className="text-red-500 hover:underline"
                  >
                    重設篩選 ({selectedServices.length})
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                {allServices.map((svc) => {
                  const isChecked = selectedServices.includes(svc);
                  return (
                    <label
                      key={svc}
                      className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleService(svc)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-700"
                      />
                      <span>{svc}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 pt-2.5 dark:border-slate-800">
          <div>
            符合條件站點：
            <span className="font-bold text-blue-600 dark:text-blue-400">
              {filteredStations.length}
            </span>{" "}
            座
            {selectedServices.length > 0 && (
              <span className="ml-2 text-slate-600">
                (已套用 {selectedServices.length} 項服務條件)
              </span>
            )}
          </div>
          {(selectedServices.length > 0 || searchQuery) && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              清除全部搜尋與篩選
            </button>
          )}
        </div>
      </section>

      {/* Interactive Map View */}
      <section>
        <CpcStationMap
          stations={filteredStations.slice(0, 150)}
          userLocation={userLocation}
          selectedStationId={selectedStationId}
          onSelectStation={(st) => setSelectedStationId(st.id)}
          onRecenter={() => geo.refresh()}
        />
        <div className="mt-2 text-right text-[11px] text-slate-600">
          地圖預設標記前 150 筆符合條件站點 · 點擊圖標可展開導航與詳細服務
        </div>
      </section>

      {/* Station List Cards Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            據點清單列表
          </h3>
          <span className="text-xs text-slate-600">
            第 {page} / {Math.max(1, totalPages)} 頁 · 每頁 {pageSize} 筆
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {paginatedStations.length === 0 ? (
            <div className="col-span-full py-12 text-center text-sm text-slate-600">
              查無符合條件的中油加油站，請嘗試放寬篩選條件或清除關鍵字。
            </div>
          ) : (
            paginatedStations.map((st) => {
              const isSelected = selectedStationId === st.id;
              const services = st.extra_json?.services || [];
              const hours = st.extra_json?.serviceHours || {};
              const fuelTypes = st.extra_json?.fuelTypes;
              const paymentMethods = st.extra_json?.paymentMethods;
              const businessHours = st.extra_json?.businessHours;
              const washCategory = st.extra_json?.washCategory;
              const availableFuels = fuelTypes
                ? Object.entries(fuelTypes)
                    .filter(([, v]) => v)
                    .map(([k]) => FUEL_TYPE_LABELS[k] || k)
                : [];
              const availablePayments = paymentMethods
                ? Object.entries(paymentMethods)
                    .filter(([, v]) => v)
                    .map(([k]) => PAYMENT_METHOD_LABELS[k] || k)
                : [];

              return (
                <div
                  key={st.id}
                  onClick={() => setSelectedStationId(st.id)}
                  className={`cursor-pointer rounded-2xl border p-5 transition-all ${
                    isSelected
                      ? "border-blue-500 bg-blue-50/20 shadow-md dark:border-blue-400 dark:bg-blue-950/20"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {st.name}
                        </h4>
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {st.extra_json?.stationCode}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        📍 {st.address || "地址未登記"}
                      </p>
                    </div>

                    {st.distance_km !== undefined && (
                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                        {st.distance_km} km
                      </span>
                    )}
                  </div>

                  {/* Phone and Hours */}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
                    {st.phone && (
                      <div>
                        📞 <a href={`tel:${st.phone}`} className="hover:text-blue-600">{st.phone}</a>
                      </div>
                    )}
                    {hours["洗車服務"] && (
                      <div className="text-blue-600 dark:text-blue-400">
                        🧽 洗車時段：{hours["洗車服務"]}
                        {washCategory ? `（${washCategory}）` : ""}
                      </div>
                    )}
                    {businessHours && (
                      <div>
                        🕐 總營業時間：{businessHours}
                      </div>
                    )}
                  </div>

                  {/* Service Badges */}
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                    {services.map((svc) => (
                      <span
                        key={svc}
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                          selectedServices.includes(svc)
                            ? "bg-blue-600 text-white dark:bg-blue-500"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {svc}
                      </span>
                    ))}
                  </div>

                  {/* Fuel Types & Payment Methods */}
                  {(availableFuels.length > 0 || availablePayments.length > 0) && (
                    <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                      {availableFuels.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            ⛽ 供應油品：
                          </span>
                          {availableFuels.map((fuel) => (
                            <span
                              key={fuel}
                              className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                            >
                              {fuel}
                            </span>
                          ))}
                        </div>
                      )}
                      {availablePayments.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                            💳 付款方式：
                          </span>
                          {availablePayments.map((method) => (
                            <span
                              key={method}
                              className="rounded-md bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"
                            >
                              {method}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Footer Navigation Action */}
                  <div className="mt-4 flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedStationId(st.id);
                        window.scrollTo({ top: 380, behavior: "smooth" });
                      }}
                      className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
                    >
                      地圖定位此站
                    </button>

                    <a
                      href={buildGoogleMapsDirUrl({
                        name: st.name,
                        address: st.address,
                        lat: st.lat,
                        lng: st.lng,
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-300"
                    >
                      <span>{getNavigationButtonLabel(locale)}</span>
                      <span className="text-[10px]">↗</span>
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300"
            >
              上一頁
            </button>
            <span className="px-2 text-xs font-medium text-slate-600">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300"
            >
              下一頁
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
