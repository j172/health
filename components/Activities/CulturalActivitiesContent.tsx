"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import type { CulturalActivityItem } from "@/app/api/culture/shows/route";

const TAIWAN_CITIES = [
  "全部縣市",
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

export default function CulturalActivitiesContent() {
  const [items, setItems] = useState<CulturalActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [keyword, setKeyword] = useState("");
  const [selectedCity, setSelectedCity] = useState("全部縣市");
  const [timeFilter, setTimeFilter] = useState<"all" | "weekend" | "month">("all");

  useEffect(() => {
    let ignore = false;
    async function loadData() {
      try {
        const res = await fetch("/api/culture/shows");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "載入失敗");
        if (!ignore) {
          setItems(json.items || []);
          setError(null);
        }
      } catch (err: any) {
        if (!ignore) {
          setError(err.message || "無法連線至文化部活動資料庫");
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      ignore = true;
    };
  }, []);

  const handleRetry = () => {
    setLoading(true);
    setError(null);
    fetch("/api/culture/shows")
      .then((res) => res.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error || "載入失敗");
        setItems(json.items || []);
      })
      .catch((err) => setError(err.message || "載入失敗"))
      .finally(() => setLoading(false));
  };

  const filteredItems = useMemo(() => {
    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7).replace(/-/g, "/");

    return items.filter((item) => {
      // Keyword
      if (keyword.trim()) {
        const kw = keyword.toLowerCase().trim();
        const matchTitle = item.title.toLowerCase().includes(kw);
        const matchDesc = item.description.toLowerCase().includes(kw);
        const matchUnit = item.masterUnit?.toLowerCase().includes(kw);
        const matchVenue = item.shows.some(
          (s) =>
            s.location.toLowerCase().includes(kw) ||
            s.locationName.toLowerCase().includes(kw)
        );
        if (!matchTitle && !matchDesc && !matchUnit && !matchVenue) return false;
      }

      // City filter
      if (selectedCity !== "全部縣市") {
        const matchCity = item.shows.some(
          (s) => s.location.includes(selectedCity) || s.locationName.includes(selectedCity)
        );
        if (!matchCity) return false;
      }

      // Time filter
      if (timeFilter === "month") {
        if (!item.startDate.startsWith(currentMonth) && !item.endDate.startsWith(currentMonth)) {
          return false;
        }
      }

      return true;
    });
  }, [items, keyword, selectedCity, timeFilter]);

  return (
    <div className="space-y-6">
      {/* Header Search & Filters Panel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Keyword Search */}
          <div className="relative flex-1">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋親子活動、劇團、音樂會或場館名稱..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder-slate-500"
            />
            {keyword && (
              <button
                type="button"
                onClick={() => setKeyword("")}
                className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                清除
              </button>
            )}
          </div>

          {/* City Filter */}
          <select
            value={selectedCity}
            onChange={(e) => setSelectedCity(e.target.value)}
            aria-label="選擇活動縣市"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-700 transition-colors focus:border-indigo-500 focus:bg-white focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {TAIWAN_CITIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Time Preset Buttons */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100/70 p-1 dark:border-slate-800 dark:bg-slate-800/80">
            <button
              type="button"
              onClick={() => setTimeFilter("all")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                timeFilter === "all"
                  ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              全部活動
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter("month")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                timeFilter === "month"
                  ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-700 dark:text-indigo-400"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              本月檔期
            </button>
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            目前收錄 <strong className="font-semibold text-indigo-600 dark:text-indigo-400">{filteredItems.length}</strong> 檔最新親子藝文展演
          </span>
          <span>資料來源：文化部全國藝文活動開放資料</span>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2, 3, 4].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="h-5 w-3/4 rounded-md bg-slate-200 dark:bg-slate-800" />
              <div className="mt-3 h-4 w-1/2 rounded-md bg-slate-200 dark:bg-slate-800" />
              <div className="mt-4 h-20 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
            </div>
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-6 text-center dark:border-rose-900/50 dark:bg-rose-950/20">
          <p className="text-sm font-medium text-rose-800 dark:text-rose-300">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-rose-500"
          >
            重新載入
          </button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && filteredItems.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
          <span className="text-4xl">🎭</span>
          <h3 className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">查無符合條件的親子活動</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">可嘗試切換縣市或清除關鍵字搜尋。</p>
        </div>
      )}

      {/* Activities Grid */}
      {!loading && !error && filteredItems.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2">
          {filteredItems.map((item) => {
            const hasMultipleShows = item.shows.length > 1;
            const firstShow = item.shows[0];
            const promoUrl = item.sourceWebPromote || item.webSales;

            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-indigo-700/60"
              >
                <div>
                  {/* Category & Date badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                      🎨 親子藝文
                    </span>
                    {item.masterUnit && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {item.masterUnit}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] font-semibold text-slate-400">
                      {item.startDate} ~ {item.endDate}
                    </span>
                  </div>

                  {/* Activity Title */}
                  <h3 className="mt-2.5 text-base font-bold text-slate-900 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                    {item.title}
                  </h3>

                  {/* Description preview */}
                  {item.description && (
                    <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {item.description}
                    </p>
                  )}

                  {/* Show Venues & Times */}
                  <div className="mt-4 space-y-2 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
                    {item.shows.slice(0, 3).map((show, idx) => (
                      <div key={idx} className="flex items-start justify-between gap-2 border-b border-slate-200/60 pb-1.5 last:border-b-0 last:pb-0 dark:border-slate-700/60">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            📍 {show.locationName || show.location || "展演場地"}
                          </div>
                          {show.location && show.location !== show.locationName && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {show.location}
                            </div>
                          )}
                          <div className="mt-0.5 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                            🕒 {show.time}
                          </div>
                        </div>
                        {show.price && (
                          <span className="flex-shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                            {show.price.includes("免費") ? "免費入場" : show.price.slice(0, 20)}
                          </span>
                        )}
                      </div>
                    ))}
                    {item.shows.length > 3 && (
                      <div className="text-center text-[11px] font-medium text-slate-400">
                        共 {item.shows.length} 場演出場次
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer action buttons */}
                <div className="mt-4 flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                  {firstShow?.location && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        firstShow.locationName || firstShow.location
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-xs font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750"
                    >
                      🗺️ 場館導航
                    </a>
                  )}

                  {promoUrl && (
                    <a
                      href={promoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-xl bg-indigo-600 px-3 py-2 text-center text-xs font-semibold text-white shadow-xs transition-colors hover:bg-indigo-500"
                    >
                      🎟️ 前往購票／官網 ↗
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
