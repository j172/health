"use client";

import { useState } from "react";
import type { SignificantEarthquake } from "@/lib/server/earthquakes/queries";
import { useLanguage } from "@/app/context/LanguageContext";

const toTaipeiTime = (value: Date | string | null): string => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Asia/Taipei",
    }).format(new Date(value));
  } catch {
    return "";
  }
};

const getMagBadge = (magInput: number | string) => {
  const mag = isNaN(Number(magInput)) ? 0 : Number(magInput);
  if (mag <= 0) {
    return {
      bg: "bg-slate-500 text-white dark:bg-slate-600",
      label: "M -",
    };
  }
  if (mag >= 7.0) {
    return {
      bg: "bg-red-500 text-white dark:bg-red-600",
      label: "強震 M7.0+",
    };
  }
  if (mag >= 6.0) {
    return {
      bg: "bg-amber-500 text-white dark:bg-amber-600",
      label: "顯著 M6.0+",
    };
  }
  return {
    bg: "bg-indigo-500 text-white dark:bg-indigo-600",
    label: `M${mag.toFixed(1)}`,
  };
};

export default function EarthquakeContent({ earthquakes }: { earthquakes: SignificantEarthquake[] }) {
  const [filterMinMag, setFilterMinMag] = useState<number>(6.0);
  const { locale, tDynamic } = useLanguage();

  const filtered = earthquakes.filter((e) => Number(e.magnitude) >= filterMinMag);

  return (
    <div className="space-y-8">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 rounded-full bg-amber-500 animate-ping" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {tDynamic("全球與全台顯著地震動態 (M6.0+)")}
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {tDynamic("資料來源：美國地質調查局 (USGS) · 歐洲地中海地震中心 (EMSC) · 中央氣象署 (CWA)")}
          </p>
        </div>

        {/* Magnitude Filter Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {tDynamic("篩選規模：")}
          </span>
          {[
            { label: tDynamic("全部 (M4.0+)"), val: 4.0 },
            { label: tDynamic("M6.0+ 顯著"), val: 6.0 },
            { label: tDynamic("M7.0+ 強震"), val: 7.0 },
          ].map((opt) => (
            <button
              key={opt.val}
              onClick={() => setFilterMinMag(opt.val)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filterMinMag === opt.val
                  ? "bg-indigo-600 text-white dark:bg-indigo-500 shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Earthquakes List Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-400 dark:border-slate-800 dark:bg-slate-900">
          {tDynamic("目前沒有符合此規模篩選條件的顯著地震紀錄。")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((item) => {
            const badge = getMagBadge(item.magnitude);
            const rawLoc = locale === "en" ? (item.place?.trim() || item.place_zh?.trim()) : (item.place_zh?.trim() || item.place?.trim());
            const location = tDynamic(rawLoc) || "未具名震央區域";

            return (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-extrabold shadow-2xs ${badge.bg}`}>
                      {badge.label}
                    </span>

                    {item.tsunami_warning === 1 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-600 dark:bg-red-950 dark:text-red-300 animate-pulse">
                        🌊 海嘯警報
                      </span>
                    )}

                    <span className="text-xs text-slate-400">
                      {toTaipeiTime(item.event_time)}
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold leading-snug text-slate-900 dark:text-slate-100 line-clamp-2">
                    📍 {location}
                  </h3>

                  {item.place && item.place_zh && (
                    <p className="mt-1 text-xs text-slate-400 font-mono line-clamp-1">
                      {item.place}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 text-xs dark:border-slate-800">
                  <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                    {item.depth_km != null && (
                      <span>深度: <strong className="text-slate-700 dark:text-slate-200">{item.depth_km} km</strong></span>
                    )}
                    {item.primary_source && (
                      <span className="uppercase text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">
                        {item.primary_source}
                      </span>
                    )}
                  </div>

                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      官方測報 ↗
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
