"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import LoadingOrb from "@/components/ui/LoadingOrb";
import type { ContraceptionPoint } from "./ContraceptionMapLeaflet";

const ContraceptionMapLeaflet = dynamic(
  () => import("./ContraceptionMapLeaflet"),
  { ssr: false },
);

const COUNTIES = [
  "全部縣市", "台北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
  "台中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣", "台南市",
  "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "台東縣", "澎湖縣", "金門縣", "連江縣",
];

const COUNTY_COORDINATES: Record<string, [number, number]> = {
  基隆市: [25.1276, 121.7392],
  台北市: [25.0375, 121.5637],
  新北市: [25.0125, 121.4658],
  桃園市: [24.9936, 121.301],
  新竹市: [24.8039, 120.9647],
  新竹縣: [24.8387, 121.0177],
  苗栗縣: [24.5601, 120.8214],
  台中市: [24.1627, 120.6473],
  彰化縣: [24.0816, 120.5385],
  南投縣: [23.91, 120.686],
  雲林縣: [23.7093, 120.4313],
  嘉義市: [23.48, 120.4491],
  嘉義縣: [23.4518, 120.2555],
  台南市: [22.9997, 120.227],
  高雄市: [22.6273, 120.3014],
  屏東縣: [22.6826, 120.4879],
  宜蘭縣: [24.757, 121.753],
  花蓮縣: [23.9912, 121.6196],
  台東縣: [22.7583, 121.1444],
  澎湖縣: [23.5658, 119.5793],
  金門縣: [24.4327, 118.3226],
  連江縣: [26.1558, 119.9519],
};

export default function ContraceptionMapContent() {
  const [points, setPoints] = useState<ContraceptionPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategory, setSelectedCategory] = useState<"all" | "clinic" | "pharmacy">("all");
  const [selectedCounty, setSelectedCounty] = useState("全部縣市");
  const [keyword, setKeyword] = useState("");
  const [viewMode, setViewMode] = useState<"map" | "list">("map");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contraception-map");
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
    let clinic = 0;
    let pharmacy = 0;
    for (const p of points) {
      if (p.category === "clinic") clinic++;
      else pharmacy++;
    }
    return { clinic, pharmacy };
  }, [points]);

  const filteredPoints = useMemo(() => {
    return points.filter((p) => {
      const matchCat =
        selectedCategory === "all" || p.category === selectedCategory;
      const matchCounty =
        selectedCounty === "全部縣市" ||
        p.city === selectedCounty ||
        p.address.includes(selectedCounty) ||
        (selectedCounty.includes("台") && p.city === selectedCounty.replace("台", "臺")) ||
        (selectedCounty.includes("臺") && p.city === selectedCounty.replace("臺", "台"));
      const kw = keyword.trim().toLowerCase();
      const matchKeyword =
        !kw ||
        p.name.toLowerCase().includes(kw) ||
        p.address.toLowerCase().includes(kw);
      return matchCat && matchCounty && matchKeyword;
    });
  }, [points, selectedCategory, selectedCounty, keyword]);

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
          🛡️ 避孕諮詢地圖：婦產科診所與諮詢藥局
        </h1>
        <p className="text-neutral-600 dark:text-slate-300">
          整合台灣婦產科醫學會 BeOK 避孕諮詢室官方名冊，提供全台專業婦產科診所與健保諮詢藥局雙圖層查詢、事前與事後避孕藥諮詢與雙重避孕衛教服務。
        </p>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-sky-50/60 p-4 text-xs leading-relaxed text-sky-900 dark:border-sky-950/60 dark:bg-sky-950/30 dark:text-sky-200">
        <p className="font-semibold mb-1">💡 什麼是「雙重避孕法」？</p>
        <p>
          女生常態使用口服事前避孕藥或子宮內避孕器，男生全程且正確使用保險套。雙重防護可達到 99% 以上避孕率並有效預防性傳染病。若有避孕需求，可就近諮詢本名冊認證之專業醫師或藥師。
        </p>
      </div>

      {/* Filter controls */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          {/* Category Tabs */}
          <div className="flex items-center rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => setSelectedCategory("all")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                selectedCategory === "all"
                  ? "bg-white text-neutral-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              全部 ({points.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("clinic")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                selectedCategory === "clinic"
                  ? "bg-sky-600 text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              🏥 婦產科診所 ({counts.clinic})
            </button>
            <button
              type="button"
              onClick={() => setSelectedCategory("pharmacy")}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                selectedCategory === "pharmacy"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              💊 諮詢藥局 ({counts.pharmacy})
            </button>
          </div>

          <select
            value={selectedCounty}
            onChange={(e) => setSelectedCounty(e.target.value)}
            className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {COUNTIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <input
            type="text"
            placeholder="搜尋據點名稱或地址..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-40 sm:w-56 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs text-neutral-800 placeholder-neutral-400 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />

          <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950/70 dark:text-sky-300">
            符合 {filteredPoints.length} 處
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("map")}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              viewMode === "map"
                ? "bg-sky-600 text-white shadow-sm"
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
                ? "bg-sky-600 text-white shadow-sm"
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
            <ContraceptionMapLeaflet
              key={`${selectedCounty}-${selectedCategory}-${mapCenter.join(",")}`}
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
              查無符合條件的避孕諮詢據點。
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filteredPoints.slice(0, 60).map((p) => {
                const isClinic = p.category === "clinic";
                return (
                  <div
                    key={`${p.category}-${p.id}`}
                    className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                            isClinic
                              ? "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
                              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                          }`}
                        >
                          {isClinic ? "🏥 婦產科診所" : "💊 諮詢藥局"}
                        </span>
                        <span className="text-xs font-medium text-neutral-500 dark:text-slate-400">
                          {p.city}
                        </span>
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                          `${p.name} ${p.address}`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-semibold text-sky-600 hover:underline"
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
                );
              })}
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
