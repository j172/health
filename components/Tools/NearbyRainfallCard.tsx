"use client";

import { useEffect, useState } from "react";
import { useGeolocation } from "@/components/Facilities/useGeolocation";
import LoadingOrb from "@/components/ui/LoadingOrb";
import {
  type NearestRainfallStation,
  type RainfallAccumulationSummary,
} from "@/app/api/rainfall/nearest/route";

/**
 * Rainfall at the reader's nearest CWA rain gauge.
 *
 * CWA runs 1,331 of them and the readings have been syncing into cwa_rainfall
 * every 30 minutes since the table was created, with nothing reading it.
 *
 * The accumulation ladder is the point: "is it raining right now" and "how much
 * has fallen today" are different questions, and a single number answers
 * neither well. Now / 1hr / 3hr / 6hr / 12hr / 24hr are shown together so the
 * reader can see whether rain is starting, steady, or already over.
 */

/** CWA reports a trace amount as "T"; anything else is millimetres. */
const display = (value: string | null): string => {
  if (value == null) return "–";
  if (value.toUpperCase() === "T") return "微量";
  return value;
};

/** Non-zero rainfall gets emphasis; a flat zero should stay quiet. */
const isWet = (value: string | null): boolean => {
  if (value == null) return false;
  if (value.toUpperCase() === "T") return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
};

const LADDER: { key: keyof NearestRainfallStation; label: string }[] = [
  { key: "now", label: "目前" },
  { key: "past1hr", label: "1 小時" },
  { key: "past3hr", label: "3 小時" },
  { key: "past6hr", label: "6 小時" },
  { key: "past12hr", label: "12 小時" },
  { key: "past24hr", label: "24 小時" },
];

export default function NearbyRainfallCard() {
  // Both halves arrive in one response, so this resolves geolocation itself
  // rather than going through useNearestStation, which only surfaces `station`.
  const location = useGeolocation();
  const [data, setData] = useState<{
    station: NearestRainfallStation | null;
    totals: RainfallAccumulationSummary | null;
  } | null>(null);

  useEffect(() => {
    if (location.loading) return;
    let active = true;
    fetch(`/api/rainfall/nearest?lat=${location.lat}&lng=${location.lng}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (active)
          setData({
            station: body?.station ?? null,
            totals: body?.totals ?? null,
          });
      })
      .catch((error) => {
        console.error("Nearest rainfall fetch failed:", error);
        if (active) setData({ station: null, totals: null });
      });
    return () => {
      active = false;
    };
  }, [location.loading, location.lat, location.lng]);

  const station = data?.station ?? null;
  const totals = data?.totals ?? null;
  const showSpinner = (location.loading || data === null) && !station;
  const isRefreshing = location.refreshing;
  const isDefault = location.isDefault;
  const refresh = location.refresh;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-xl dark:bg-sky-950">
            🌧️
          </span>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 sm:text-xl dark:text-slate-100">
              即時雨量
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {station
                ? `${station.county ?? ""}${station.town ?? ""} ${station.stationName ?? ""} 測站 · 距離約 ${station.distanceKm} 公里`
                : "依您的所在位置尋找最近的中央氣象署雨量站"}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={refresh}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          disabled={isRefreshing}
        >
          {isRefreshing ? "更新中…" : "重新定位"}
        </button>
      </div>

      {isDefault && !showSpinner ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          未取得定位權限，目前顯示的是預設地點的雨量站。
        </p>
      ) : null}

      {showSpinner ? (
        <div className="flex justify-center py-10">
          <LoadingOrb size={28} />
        </div>
      ) : station ? (
        <>
          <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {LADDER.map(({ key, label }) => {
              const value = station[key] as string | null;
              const wet = isWet(value);
              return (
                <div
                  key={key}
                  className={`rounded-xl p-3 text-center ${
                    wet
                      ? "bg-sky-50 dark:bg-sky-950/50"
                      : "bg-slate-50 dark:bg-slate-800/60"
                  }`}
                >
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    {label}
                  </p>
                  <p
                    className={`mt-1 text-lg font-extrabold tabular-nums ${
                      wet
                        ? "text-sky-700 dark:text-sky-300"
                        : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {display(value)}
                    <span className="ml-0.5 text-[10px] font-semibold text-slate-400">
                      mm
                    </span>
                  </p>
                </div>
              );
            })}
          </div>

          {totals && (totals.monthMm !== null || totals.yearMm !== null) ? (
            <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                累積雨量
                <span className="ml-1 font-normal text-slate-400">
                  （{totals.stationName ?? "最近測站"} 署屬站 ·{" "}
                  {totals.distanceKm} 公里）
                </span>
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                <span className="text-slate-600 dark:text-slate-300">
                  本月{" "}
                  <span className="font-extrabold text-sky-700 tabular-nums dark:text-sky-300">
                    {totals.monthMm ?? "–"}
                  </span>
                  <span className="ml-0.5 text-[10px] text-slate-400">mm</span>
                </span>
                <span className="text-slate-600 dark:text-slate-300">
                  今年{" "}
                  <span className="font-extrabold text-sky-700 tabular-nums dark:text-sky-300">
                    {totals.yearMm ?? "–"}
                  </span>
                  <span className="ml-0.5 text-[10px] text-slate-400">mm</span>
                </span>
                {totals.wetDays30 !== null ? (
                  <span className="text-slate-600 dark:text-slate-300">
                    近 30 天{" "}
                    <span className="font-extrabold text-sky-700 tabular-nums dark:text-sky-300">
                      {totals.wetDays30}
                    </span>
                    <span className="ml-0.5 text-[10px] text-slate-400">
                      天有雨
                    </span>
                  </span>
                ) : null}
              </div>
            </div>
          ) : null}

          {station.observedAt ? (
            <p className="mt-4 text-xs text-slate-400">
              觀測時間：
              {new Date(station.observedAt).toLocaleString("zh-TW", {
                timeZone: "Asia/Taipei",
              })}
              　資料來源：中央氣象署
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-5 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          附近三小時內查無回報的雨量站。
        </p>
      )}
    </div>
  );
}
