"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import type { BreastfeedingRoomPoint } from "./BreastfeedingMapLeaflet";

const BreastfeedingMapLeaflet = dynamic(
  () => import("./BreastfeedingMapLeaflet"),
  { ssr: false },
);

const COUNTIES = [
  "全部縣市", "基隆市", "臺北市", "新北市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "臺南市",
  "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣", "澎湖縣", "金門縣", "連江縣",
];

const COUNTY_COORDINATES: Record<string, [number, number]> = {
  基隆市: [25.1276, 121.7392],
  臺北市: [25.0375, 121.5637],
  新北市: [25.0125, 121.4658],
  桃園市: [24.9936, 121.301],
  新竹市: [24.8039, 120.9647],
  新竹縣: [24.8387, 121.0177],
  苗栗縣: [24.5601, 120.8214],
  臺中市: [24.1627, 120.6473],
  彰化縣: [24.0816, 120.5385],
  南投縣: [23.91, 120.686],
  雲林縣: [23.7093, 120.4313],
  嘉義市: [23.48, 120.4491],
  嘉義縣: [23.4518, 120.2555],
  臺南市: [22.9997, 120.227],
  高雄市: [22.6273, 120.3014],
  屏東縣: [22.6826, 120.4879],
  宜蘭縣: [24.757, 121.753],
  花蓮縣: [23.9912, 121.6196],
  臺東縣: [22.7583, 121.1444],
  澎湖縣: [23.5658, 119.5793],
  金門縣: [24.4327, 118.3226],
  連江縣: [26.1558, 119.9519],
};

export default function BreastfeedingMapContent() {
  const [points, setPoints] = useState<BreastfeedingRoomPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCounty, setSelectedCounty] = useState("全部縣市");
  const [selectedType, setSelectedType] = useState<"all" | "statutory" | "voluntary">("all");
  const [keyword, setKeyword] = useState("");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/breastfeeding-rooms");
        const json = await res.json();
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error || "資料載入失敗");
        } else {
          setPoints(json.points ?? []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message || "資料載入失敗");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => {
    let statutory = 0;
    let voluntary = 0;
    for (const p of points) {
      if (p.settingType === "statutory") statutory++;
      else voluntary++;
    }
    return { statutory, voluntary };
  }, [points]);

  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      const matchCounty =
        selectedCounty === "全部縣市" || p.county === selectedCounty;
      const matchType =
        selectedType === "all" || p.settingType === selectedType;
      const kw = keyword.trim().toLowerCase();
      const matchKeyword =
        !kw ||
        p.name.toLowerCase().includes(kw) ||
        (p.address && p.address.toLowerCase().includes(kw));
      return matchCounty && matchType && matchKeyword;
    });
  }, [points, selectedCounty, selectedType, keyword]);

  const mapCenter = useMemo((): [number, number] => {
    if (selectedCounty !== "全部縣市" && COUNTY_COORDINATES[selectedCounty]) {
      return COUNTY_COORDINATES[selectedCounty];
    }
    return [23.6978, 120.9605];
  }, [selectedCounty]);

  const mapZoom = selectedCounty === "全部縣市" ? 8 : 12;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="mb-2 text-3xl font-bold text-neutral-800 dark:text-slate-100 md:text-4xl">
          🍼 全國哺集乳室地圖查詢
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          整合衛生福利部國民健康署「孕產兒關懷網站」開放資料，提供全台公共場所依法應設置與自願設置之哺集乳室清單、GPS 定位與導航。
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 text-xs leading-relaxed text-neutral-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        <p>
          資料來源：衛生福利部國民健康署 孕產兒關懷網站。依據《公共場所母乳哺育條例》，特定公共場所應設置哺集乳室並開放哺乳使用。目前全台收錄 {points.length > 0 ? points.length.toLocaleString() : "3,800+"} 處點位。
        </p>
      </div>

      {/* Filter controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedCounty}
            onChange={(e) => setSelectedCounty(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="搜尋場所名稱或地址關鍵字..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-48 sm:w-64 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-800 placeholder-neutral-400 shadow-sm focus:border-pink-500 focus:outline-none focus:ring-1 focus:ring-pink-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />

          <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setSelectedType("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                selectedType === "all"
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              全部 ({points.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedType("statutory")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                selectedType === "statutory"
                  ? "bg-amber-500 text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              🏛️ 依法設置 ({counts.statutory})
            </button>
            <button
              type="button"
              onClick={() => setSelectedType("voluntary")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                selectedType === "voluntary"
                  ? "bg-pink-600 text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              🍼 自願設置 ({counts.voluntary})
            </button>
          </div>

          <span className="rounded-full bg-pink-100 px-2.5 py-1 text-xs font-semibold text-pink-700 dark:bg-pink-950/70 dark:text-pink-300">
            符合 {filteredPoints.length} 處
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("map")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "map"
                ? "bg-pink-600 text-white shadow-sm"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            🗺️ 地圖模式
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "list"
                ? "bg-pink-600 text-white shadow-sm"
                : "border border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            📋 清單模式
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Main content display */}
      {viewMode === "map" ? (
        <div className="h-[65vh] min-h-[450px] w-full overflow-hidden rounded-2xl border border-neutral-200 dark:border-slate-800">
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <LoadingOrb />
            </div>
          ) : (
            <BreastfeedingMapLeaflet
              key={`${selectedCounty}-${mapCenter.join(",")}`}
              points={filteredPoints}
              center={mapCenter}
              zoom={mapZoom}
            />
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {loading ? (
            <div className="py-12 flex justify-center">
              <LoadingOrb />
            </div>
          ) : filteredPoints.length === 0 ? (
            <div className="rounded-2xl border border-neutral-200 p-8 text-center text-sm text-neutral-500 dark:border-slate-800 dark:text-slate-400">
              查無符合條件的哺集乳室。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPoints.slice(0, 60).map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                        p.settingType === "statutory"
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                          : "bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300"
                      }`}>
                        {p.settingType === "statutory" ? "🏛️ 依法設置" : "🍼 自願設置"}
                      </span>
                      <span className="text-xs font-medium text-neutral-500 dark:text-slate-400">
                        {p.county}
                      </span>
                    </div>
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        `${p.name} ${p.address}`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-pink-600 hover:underline"
                    >
                      導航 ↗
                    </a>
                  </div>
                  <h3 className="mt-2 text-base font-bold text-neutral-800 dark:text-slate-100">
                    {p.name}
                  </h3>
                  <p className="mt-1 text-xs text-neutral-600 dark:text-slate-300">
                    {p.address}
                  </p>
                  {p.phone && (
                    <p className="mt-1.5 text-xs text-neutral-500">
                      📞 <a href={`tel:${p.phone.replace(/[^0-9]/g, "")}`} className="hover:underline">{p.phone}</a>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          {filteredPoints.length > 60 && (
            <p className="text-center text-xs text-neutral-500">
              清單模式僅顯示前 60 筆，請縮小縣市或關鍵字範圍，或切換至「地圖模式」瀏覽全台據點。
            </p>
          )}
        </div>
      )}
    </div>
  );
}
