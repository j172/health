"use client";

import { useState } from "react";
import type { UvStationItem } from "@/lib/server/cwa/queries";

function safeToFixed(val: unknown, digits = 1): string {
  const num = typeof val === "number" ? val : parseFloat(String(val ?? ""));
  return isNaN(num) ? "-" : num.toFixed(digits);
}

const getUvRiskLevel = (uvInput: unknown) => {
  const num = typeof uvInput === "number" ? uvInput : parseFloat(String(uvInput ?? ""));
  const uv = isNaN(num) ? 0 : num;
  if (isNaN(num)) {
    return {
      level: "未知量級",
      bg: "bg-slate-500 text-white dark:bg-slate-600",
      border: "border-slate-200 dark:border-slate-800",
      cardBg: "bg-slate-50/50 dark:bg-slate-900/20",
      textColor: "text-slate-600 dark:text-slate-400",
      advice: "暫無數據說明。",
    };
  }
  if (uv >= 11) {
    return {
      level: "極高量級 (11+)",
      bg: "bg-purple-600 text-white dark:bg-purple-700",
      border: "border-purple-200 dark:border-purple-900/50",
      cardBg: "bg-purple-50/50 dark:bg-purple-950/20",
      textColor: "text-purple-600 dark:text-purple-400",
      advice: "⚠️ 避免上午 10 時至下午 2 時過度曝曬。戶外防護：塗抹 SPF50+ 防曬乳、配戴帽子、太陽眼鏡、遮陽傘，並盡量尋求陰涼處。",
    };
  }
  if (uv >= 8) {
    return {
      level: "過量級 (8-10)",
      bg: "bg-red-500 text-white dark:bg-red-600",
      border: "border-red-200 dark:border-red-900/50",
      cardBg: "bg-red-50/50 dark:bg-red-950/20",
      textColor: "text-red-600 dark:text-red-400",
      advice: "⚠️ 曬傷時間約 15-20 分鐘。戶外活動務必塗抹 SPF30+ 以上防曬乳、穿戴帽子與防曬遮陽衣物。",
    };
  }
  if (uv >= 6) {
    return {
      level: "高量級 (6-7)",
      bg: "bg-amber-500 text-white dark:bg-amber-600",
      border: "border-amber-200 dark:border-amber-900/50",
      cardBg: "bg-amber-50/50 dark:bg-amber-950/20",
      textColor: "text-amber-600 dark:text-amber-400",
      advice: "建議戴帽子、佩戴太陽眼鏡、塗抹防曬乳，午後適時補充水分。",
    };
  }
  if (uv >= 3) {
    return {
      level: "中量級 (3-5)",
      bg: "bg-yellow-500 text-slate-900 dark:bg-yellow-600 dark:text-white",
      border: "border-yellow-200 dark:border-yellow-900/50",
      cardBg: "bg-yellow-50/50 dark:bg-yellow-950/20",
      textColor: "text-yellow-600 dark:text-yellow-400",
      advice: "一般性日常防護，若長時間在戶外建議補充防曬用品。",
    };
  }
  return {
    level: "低量級 (0-2)",
    bg: "bg-emerald-500 text-white dark:bg-emerald-600",
    border: "border-emerald-200 dark:border-emerald-900/50",
    cardBg: "bg-emerald-50/50 dark:bg-emerald-950/20",
    textColor: "text-emerald-600 dark:text-emerald-400",
    advice: "低風險無虞，可安全在戶外活動。",
  };
};

export default function UvContent({ stations }: { stations: UvStationItem[] }) {
  const [selectedCounty, setSelectedCounty] = useState<string>("全部");
  const [search, setSearch] = useState<string>("");

  const counties = ["全部", ...Array.from(new Set(stations.map((s) => s.county_name).filter(Boolean))) as string[]];

  const filtered = stations.filter((item) => {
    const matchCounty = selectedCounty === "全部" || item.county_name === selectedCounty;
    const matchSearch =
      search.trim() === "" ||
      (item.station_name && item.station_name.includes(search)) ||
      (item.county_name && item.county_name.includes(search));
    return matchCounty && matchSearch;
  });

  return (
    <div className="space-y-8">
      {/* UV Level Legend Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <h3 className="mb-3 text-sm font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
          ☀️ 紫外線指數 (UV Index) 防護等級說明
        </h3>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          <div className="rounded-xl bg-emerald-50 p-2.5 dark:bg-emerald-950/40">
            <span className="font-bold text-emerald-700 dark:text-emerald-300">0 - 2 低量</span>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">綠色 · 安全戶外</p>
          </div>
          <div className="rounded-xl bg-yellow-50 p-2.5 dark:bg-yellow-950/40">
            <span className="font-bold text-yellow-700 dark:text-yellow-300">3 - 5 中量</span>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">黃色 · 注意防曬</p>
          </div>
          <div className="rounded-xl bg-amber-50 p-2.5 dark:bg-amber-950/40">
            <span className="font-bold text-amber-700 dark:text-amber-300">6 - 7 高量</span>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">橘色 · 戴帽/塗防曬</p>
          </div>
          <div className="rounded-xl bg-red-50 p-2.5 dark:bg-red-950/40">
            <span className="font-bold text-red-700 dark:text-red-300">8 - 10 過量</span>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">紅色 · 減少曝曬</p>
          </div>
          <div className="col-span-2 rounded-xl bg-purple-50 p-2.5 dark:bg-purple-950/40 sm:col-span-1">
            <span className="font-bold text-purple-700 dark:text-purple-300">11+ 極高量</span>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">紫色 · 避開正午</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">縣市：</span>
          <select
            value={selectedCounty}
            onChange={(e) => setSelectedCounty(e.target.value)}
            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {counties.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="搜尋測站或縣市..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-64"
          />
        </div>
      </div>

      {/* Stations Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          目前沒有符合條件的測站數據。
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const risk = getUvRiskLevel(item.uv_index);
            const displayUv = safeToFixed(item.uv_index, 1);

            return (
              <div
                key={item.station_id}
                className={`flex flex-col justify-between overflow-hidden rounded-2xl border ${risk.border} ${risk.cardBg} p-5 shadow-xs transition-all hover:shadow-md`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {item.county_name ?? "全台測站"}
                    </span>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold shadow-2xs ${risk.bg}`}>
                      UV {displayUv}
                    </span>
                  </div>

                  <h4 className="mt-2 text-base font-bold text-slate-900 dark:text-slate-100">
                    📍 {item.station_name ?? item.station_id} 測站
                  </h4>

                  <p className={`mt-2 text-xs font-bold ${risk.textColor}`}>
                    {risk.level}
                  </p>

                  <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {risk.advice}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-800 text-[11px] text-slate-400 flex justify-between items-center">
                  <span>觀測日期: {item.obs_date}</span>
                  <span className="font-mono text-[10px]">CWA Station</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
