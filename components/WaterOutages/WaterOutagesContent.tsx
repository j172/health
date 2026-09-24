"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useGeolocation } from "@/components/Facilities/useGeolocation";
import MapLocationBanner from "@/components/Common/MapLocationBanner";
import { fetchWithTimeout } from "@/lib/client/fetchWithTimeout";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildGoogleMapsDirUrl, getNavigationButtonLabel } from "@/lib/utils/mapNavigation";
import type {
  WaterOutageItem,
  EmergencyWaterStation,
  WaterOutagesOverview,
} from "@/lib/server/waterOutages/types";
import {
  WATER_OUTAGES_SEED,
  EMERGENCY_WATER_STATIONS_SEED,
} from "@/lib/server/waterOutages/data/waterOutagesSeed";

const LeafletMap = dynamic(
  () => import("./WaterOutagesLeaflet"),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[450px] w-full items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        正在載入全臺供水與停水地圖...
      </div>
    ),
  }
);

const FALLBACK_DATA: WaterOutagesOverview = {
  activeOutages: WATER_OUTAGES_SEED.filter((o) => o.status === "active"),
  scheduledOutages: WATER_OUTAGES_SEED.filter((o) => o.status === "scheduled"),
  resolvedOutages: WATER_OUTAGES_SEED.filter((o) => o.status === "resolved"),
  waterStations: EMERGENCY_WATER_STATIONS_SEED,
  summary: {
    totalActiveOutages: 3,
    totalAffectedHouseholds: 12850,
    emergencyCount: 1,
    plannedCount: 2,
    totalWaterStations: EMERGENCY_WATER_STATIONS_SEED.length,
  },
  counties: [
    "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "新竹市", "基隆市",
  ],
};

export default function WaterOutagesContent() {
  const { locale } = useLanguage();
  const location = useGeolocation();
  const [data, setData] = useState<WaterOutagesOverview>(FALLBACK_DATA);
  const [selectedCounty, setSelectedCounty] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"active" | "scheduled" | "stations">("active");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function loadData() {
      try {
        const url =
          selectedCounty && selectedCounty !== "all"
            ? `/api/tools/water-outages?county=${encodeURIComponent(selectedCounty)}`
            : "/api/tools/water-outages";

        const res = await fetchWithTimeout(url, { timeoutMs: 5000 });
        if (res.ok) {
          const json = await res.json();
          if (!cancelled && json.ok) {
            setData(json);
          }
        }
      } catch (err) {
        console.warn("Using fallback water outages data:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [selectedCounty]);

  const displayedOutages =
    activeTab === "active" ? data.activeOutages : data.scheduledOutages;

  return (
    <div className="space-y-6">
      {/* Location banner */}
      <MapLocationBanner location={location} className="mb-2" />

      {/* Header Summary Statistics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 dark:border-red-900/50 dark:bg-red-950/30">
          <div className="flex items-center justify-between text-xs font-semibold text-red-600 dark:text-red-400">
            <span>🔴 進行中停水</span>
            <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] text-red-700 dark:bg-red-900/80 dark:text-red-300">
              即時
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black tracking-tight text-red-700 dark:text-red-300">
              {data.summary.totalActiveOutages}
            </span>
            <span className="text-xs text-red-600 dark:text-red-400">處</span>
          </div>
          <p className="mt-1 text-[11px] text-red-600/80 dark:text-red-400/80">
            突發破管: {data.summary.emergencyCount} | 計畫施工: {data.summary.plannedCount}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400">
            <span>⏳ 預告停水</span>
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/80 dark:text-amber-300">
              未來7天
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black tracking-tight text-amber-700 dark:text-amber-300">
              {data.scheduledOutages.length}
            </span>
            <span className="text-xs text-amber-600 dark:text-amber-400">處</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-600/80 dark:text-amber-400/80">
            提前儲水與防範準備
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900/50 dark:bg-blue-950/30">
          <div className="flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400">
            <span>🚰 臨時供水站</span>
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/80 dark:text-blue-300">
              取水點
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black tracking-tight text-blue-700 dark:text-blue-300">
              {data.waterStations.length}
            </span>
            <span className="text-xs text-blue-600 dark:text-blue-400">處</span>
          </div>
          <p className="mt-1 text-[11px] text-blue-600/80 dark:text-blue-400/80">
            水車／儲水桶開放取水
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600 dark:text-slate-400">
            <span>🏠 受影響戶數</span>
            <span className="text-[10px] text-slate-400">預估累計</span>
          </div>
          <div className="mt-2 flex items-baseline gap-1">
            <span className="text-2xl font-black tracking-tight text-slate-800 dark:text-slate-100">
              {data.summary.totalAffectedHouseholds.toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">戶</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            客服專線: 台水 1910 / 北水 02-8733-5678
          </p>
        </div>
      </div>

      {/* County Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSelectedCounty("all")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            selectedCounty === "all"
              ? "bg-indigo-600 text-white shadow-xs"
              : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
          }`}
        >
          全臺各縣市 ({data.counties.length})
        </button>
        {data.counties.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setSelectedCounty(c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              selectedCounty === c
                ? "bg-indigo-600 text-white shadow-xs"
                : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Leaflet Interactive Map */}
      <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/80">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
              🗺️ 停水範圍與緊急取水點地圖
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              （點擊圖標查看取水時間與地址）
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-600" />
              停水區域
            </span>
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-600" />
              臨時供水站
            </span>
          </div>
        </div>
        <LeafletMap
          outages={data.activeOutages}
          waterStations={data.waterStations}
          userLocation={!location.isDefault ? { lat: location.lat, lng: location.lng } : undefined}
        />
      </div>

      {/* Tab Switcher & Outage / Station Cards */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab("active")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "active"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            🔴 即時停水施工 ({data.activeOutages.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("scheduled")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "scheduled"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            ⏳ 預告排程停水 ({data.scheduledOutages.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("stations")}
            className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-xs font-bold transition-colors ${
              activeTab === "stations"
                ? "border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
          >
            🚰 附近供水站據點 ({data.waterStations.length})
          </button>
        </div>

        {activeTab === "stations" ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.waterStations.map((station) => (
              <div
                key={station.stationId}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950/80 dark:text-blue-300">
                      {station.waterType === "water_truck" ? "🚛 緊急水車" : "🚰 臨時儲水桶"}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {station.county} {station.township}
                    </span>
                  </div>
                  <h4 className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {station.name}
                  </h4>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    📍 {station.address}
                  </p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    🕒 開放時間：{station.operatingHours}
                  </p>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <span className="text-slate-400">
                    {station.contactPhone ? `電話: ${station.contactPhone}` : "免付費客服: 1910"}
                  </span>
                  <a
                    href={buildGoogleMapsDirUrl({
                      name: station.name,
                      address: station.address,
                      lat: station.lat,
                      lng: station.lng,
                    })}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
                  >
                    <span>{getNavigationButtonLabel(locale)}</span>
                    <span className="text-[10px]">↗</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {displayedOutages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
                目前該縣市無{activeTab === "active" ? "進行中" : "預告"}停水事件，供水狀態平穩。
              </div>
            ) : (
              displayedOutages.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                          item.outageType === "emergency"
                            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                        }`}
                      >
                        {item.outageType === "emergency" ? "⚠️ 突發破管緊急搶修" : "🔧 計畫性更換管線工程"}
                      </span>
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        {item.county} {item.township}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      來源: {item.source}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100">
                    {item.title}
                  </h3>

                  <div className="mt-3 grid gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:grid-cols-2 dark:bg-slate-800/60 dark:text-slate-300">
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        🕒 停水時間：
                      </span>
                      {new Date(item.startTime).toLocaleString("zh-TW", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ～{" "}
                      {new Date(item.endTime).toLocaleString("zh-TW", {
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        👥 影響規模：
                      </span>
                      約 {item.affectedHouseholds.toLocaleString()} 戶
                    </div>
                    <div className="sm:col-span-2">
                      <span className="font-semibold text-slate-700 dark:text-slate-200">
                        📍 影響區域範圍：
                      </span>
                      {item.affectedAreas}
                    </div>
                  </div>

                  {item.waterStations && item.waterStations.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-blue-600 dark:text-blue-400">
                        🚰 鄰近供水站：
                      </span>
                      {item.waterStations.map((st) => (
                        <span
                          key={st.stationId}
                          className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                        >
                          {st.name} ({st.operatingHours})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Emergency Guide Alert */}
      <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4 text-xs leading-relaxed text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200">
        <h4 className="font-bold text-sky-950 dark:text-sky-100">
          💡 停水期間民生應對與衛生指引
        </h4>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>
            <strong>抽水馬達防護</strong>：停水期間請關閉抽水機總電源，避免馬達空轉過熱引發火災，並防止負壓吸入污水。
          </li>
          <li>
            <strong>自備取水器具</strong>：前往臨時供水站取水時，建議自備乾淨有蓋之食品級儲水桶，避免水質二度污染。
          </li>
          <li>
            <strong>剛復水初期注意</strong>：剛恢復供水時，管線可能夾帶初期鐵鏽濁水，建議先放水 1-2 分鐘沖洗管路，待水質清澈後再煮沸飲用。
          </li>
        </ul>
      </div>
    </div>
  );
}
