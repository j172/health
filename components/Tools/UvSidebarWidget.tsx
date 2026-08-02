"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useGeolocation } from "@/components/Facilities/useGeolocation";
import { type NearestUvStation } from "@/app/api/uv/nearest/route";

interface ResolvedStation {
  lat: number;
  lng: number;
  station: NearestUvStation | null;
}

export default function UvSidebarWidget() {
  const location = useGeolocation();
  const [resolved, setResolved] = useState<ResolvedStation | null>(null);

  useEffect(() => {
    if (location.loading) return;
    let isMounted = true;
    fetch(`/api/uv/nearest?lat=${location.lat}&lng=${location.lng}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted) setResolved({ lat: location.lat, lng: location.lng, station: data?.station ?? null });
      })
      .catch((err) => {
        console.error("UV Widget fetch error:", err);
        if (isMounted) setResolved({ lat: location.lat, lng: location.lng, station: null });
      });
    return () => {
      isMounted = false;
    };
  }, [location.loading, location.lat, location.lng]);

  const station = resolved?.station ?? null;
  // 座標已更新（例如剛完成一次定位）但這組座標的測站資料還沒抓回來
  const isFetchingStation = !location.loading && (!resolved || resolved.lat !== location.lat || resolved.lng !== location.lng);
  const showSpinner = (location.loading || isFetchingStation) && !station;
  const isRefreshing = location.refreshing || (isFetchingStation && station !== null);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-slate-100">紫外線指數 (UV)</h3>
        </div>
        <button
          type="button"
          onClick={location.refresh}
          disabled={isRefreshing}
          aria-label="重新定位"
          title="重新定位"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <svg className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      {showSpinner ? (
        <div className="mt-4 flex h-24 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        </div>
      ) : station ? (
        <div className="mt-4">
          <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {station.county ?? "未知地區"}
                {station.stationName ?? "測站"}測站 · 約 {station.distanceKm} km
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{station.uvIndex}</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-xs"
                  style={{ backgroundColor: station.uvColor || "#16a34a" }}
                >
                  {station.uvLabel}
                </span>
              </div>
            </div>
          </div>
          {location.isDefault && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">定位權限未開啟，顯示台北101鄰近資料</p>
          )}
        </div>
      ) : (
        <div className="mt-4 text-center text-xs text-slate-400 py-3">暫無測站資料</div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
        <Link
          href="/tools/uv"
          className="flex items-center justify-between text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
        >
          <span>查看全台 UV 指數地圖</span>
          <span>→</span>
        </Link>
      </div>
    </div>
  );
}
