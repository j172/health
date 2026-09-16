"use client";

import React from "react";
import type { GeoLocation } from "@/components/Facilities/useGeolocation";

export interface MapLocationBannerProps {
  location: GeoLocation;
  className?: string;
  facilityTypeName?: string; // e.g. "AED", "避難收容處所"
}

export default function MapLocationBanner({
  location,
  className = "",
  facilityTypeName = "周邊設施",
}: MapLocationBannerProps) {
  const { isDefault, loading, refreshing, awaitingPermission, refresh } = location;

  // 1. 正在等待瀏覽器原生彈窗確認
  if (awaitingPermission) {
    return (
      <div
        className={`flex items-center justify-between gap-3 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-xs text-sky-900 shadow-xs dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200 ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500 text-white animate-pulse">
            📍
          </span>
          <p className="font-semibold leading-relaxed">
            正在等待您在瀏覽器提示框中點選「允許」定位權限… 授權後地圖將立即自動定位至您附近的{facilityTypeName}。
          </p>
        </div>
      </div>
    );
  }

  // 2. 採用預設定位（台北101）或定位失敗 / 權限遭拒
  if (isDefault && !loading) {
    return (
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900 shadow-xs dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200 ${className}`}
      >
        <div className="flex items-start sm:items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white font-black text-xs">
            !
          </span>
          <div className="leading-relaxed">
            <span className="font-bold">尚未取得精準定位（目前顯示預設位置：台北101）：</span>
            <span className="text-amber-800 dark:text-amber-300">
              建議開啟瀏覽器定位權限，以即時規劃最近的{facilityTypeName}與導航路線。
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={refreshing}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3.5 py-1.5 font-bold text-white shadow-xs transition-all hover:bg-amber-700 active:scale-95 disabled:opacity-50"
        >
          {refreshing ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>重新定位中…</span>
            </>
          ) : (
            <>
              <span>🎯 重新取得定位</span>
            </>
          )}
        </button>
      </div>
    );
  }

  // 3. 已成功定位
  if (!isDefault && !loading) {
    return (
      <div
        className={`flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-2 text-[11px] text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 ${className}`}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-semibold">已成功取得您的即時定位，地圖與設施已依據距離排序</span>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          disabled={refreshing}
          className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 underline text-[11px] font-medium transition"
        >
          {refreshing ? "重新整理中…" : "更新位置 ↻"}
        </button>
      </div>
    );
  }

  return null;
}
