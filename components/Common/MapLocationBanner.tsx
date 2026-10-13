"use client";

import React from "react";
import type { SharedGeolocationResult } from "@/lib/hooks/useSharedGeolocation";
import CountyDistrictPicker from "@/components/Facilities/CountyDistrictPicker";
import { useLanguage } from "@/app/context/LanguageContext";

/**
 * issue #478（母票 #438 §K）：重寫自舊版 `MapLocationBanner`（曾吃
 * `components/Facilities/useGeolocation.ts` 的 `GeoLocation` 形狀，拒絕/逾時
 * 時顯示「目前顯示預設位置：臺北101」並靜默套用那個座標畫地圖——正是這次改版
 * 要修掉的 bug class）。現在改吃 `useSharedGeolocation()`/
 * `useLocationWithManualFallback()` 的形狀：拒絕/逾時/不支援時一律顯示「請手
 * 動選擇縣市」，絕不自己套用任何座標。
 */
export interface MapLocationBannerProps {
  geolocation: SharedGeolocationResult;
  /** 使用者是否已經手動選擇了縣市（取得可用的 fallback 座標）。 */
  hasManualCoords?: boolean;
  manualCounty?: string;
  manualDistrict?: string;
  onCountyChange?: (county: string) => void;
  onDistrictChange?: (district: string) => void;
  /**
   * 預設 true：在這個橫幅裡內嵌一個 `CountyDistrictPicker`。頁面本身已經有
   * 自己的縣市／鄉鎮篩選器時（例如 `FacilitySearchContent` 的「地區快篩」），
   * 設為 false 避免畫面上出現兩個重複的縣市選單——文字說明仍會指向頁面上既有
   * 的那一個。
   */
  showPicker?: boolean;
  className?: string;
  facilityTypeName?: string; // e.g. "AED", "避難收容處所"
}

function manualSelectionReason(
  status: SharedGeolocationResult["status"],
  t: (key: string, defaultValue?: string) => string,
): string {
  if (status === "denied") return t("mapLocationBanner.deniedReason", "您已拒絕定位授權。");
  if (status === "timeout") return t("mapLocationBanner.timeoutReason", "定位逾時，無法取得您目前的位置。");
  if (status === "unsupported") return t("mapLocationBanner.unsupportedReason", "您的瀏覽器不支援定位功能。");
  return t("mapLocationBanner.defaultReason", "無法取得您目前的位置。");
}

export default function MapLocationBanner({
  geolocation,
  hasManualCoords = false,
  manualCounty = "",
  manualDistrict = "",
  onCountyChange,
  onDistrictChange,
  showPicker = true,
  className = "",
  facilityTypeName,
}: MapLocationBannerProps) {
  const { t } = useLanguage();
  const resolvedFacilityTypeName = facilityTypeName ?? t("mapLocationBanner.defaultFacilityTypeName", "周邊設施");
  const { status, awaitingPermission, needsManualSelection, refresh } = geolocation;

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
            {t(
              "mapLocationBanner.awaitingPermissionTemplate",
              "正在等待您在瀏覽器提示框中點選「允許」定位權限… 授權後地圖將立即自動定位至您附近的{type}。",
            ).replace("{type}", resolvedFacilityTypeName)}
          </p>
        </div>
      </div>
    );
  }

  // 2. 拒絕 / 逾時 / 不支援，且使用者尚未手動選擇縣市——明確提示手動選擇，絕不
  //    靜默套用任何預設座標（這正是舊版 bug class：見檔案頂端說明）。
  if (needsManualSelection && !hasManualCoords) {
    return (
      <div
        className={`space-y-3 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-900 shadow-xs dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200 ${className}`}
      >
        <div className="flex items-start gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white font-black text-xs">
            !
          </span>
          <p className="font-semibold leading-relaxed">
            {manualSelectionReason(status, t)}
            {showPicker
              ? t("mapLocationBanner.manualPromptWithPicker", "請改選您所在的縣市，以便查詢附近的{type}。").replace(
                  "{type}",
                  resolvedFacilityTypeName,
                )
              : t("mapLocationBanner.manualPromptNoPicker", "請使用上方的地區篩選，以便查詢附近的{type}。").replace(
                  "{type}",
                  resolvedFacilityTypeName,
                )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showPicker && onCountyChange && onDistrictChange && (
            <CountyDistrictPicker
              county={manualCounty}
              district={manualDistrict}
              onCountyChange={onCountyChange}
              onDistrictChange={onDistrictChange}
            />
          )}
          <button
            type="button"
            onClick={() => refresh()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-800 shadow-xs transition-colors hover:bg-amber-100 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-200"
          >
            {t("mapLocationBanner.retryLocationButton", "🔄 重新嘗試定位")}
          </button>
        </div>
      </div>
    );
  }

  // 3. 拒絕 / 逾時 / 不支援，但使用者已經手動選擇了縣市——明確標示這是手動選擇
  //    的地區，不是 GPS 定位，同時仍提供「重新嘗試定位」切回 GPS 的路徑。
  if (needsManualSelection && hasManualCoords) {
    return (
      <div
        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-xs text-indigo-900 shadow-xs dark:border-indigo-900/60 dark:bg-indigo-950/30 dark:text-indigo-200 ${className}`}
      >
        <div className="flex items-start sm:items-center gap-2.5">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white text-xs">
            📍
          </span>
          <p className="font-semibold leading-relaxed">
            {t("mapLocationBanner.manualAreaNotice", "目前顯示您選擇地區的{type}，並非即時 GPS 定位。").replace(
              "{type}",
              resolvedFacilityTypeName,
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 font-bold text-white shadow-xs transition-all hover:bg-indigo-700 active:scale-95"
        >
          {t("mapLocationBanner.switchToGpsButton", "🎯 改用 GPS 重新定位")}
        </button>
      </div>
    );
  }

  // 4. 已成功取得 GPS 定位
  if (status === "success") {
    return (
      <div
        className={`flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/70 px-3.5 py-2 text-[11px] text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300 ${className}`}
      >
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
          <span className="font-semibold">
            {t("mapLocationBanner.successNotice", "已成功取得您的即時定位，地圖與設施已依據距離排序")}
          </span>
        </div>
        <button
          type="button"
          onClick={() => refresh()}
          className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-400 dark:hover:text-emerald-200 underline text-[11px] font-medium transition"
        >
          {t("mapLocationBanner.refreshLocationLink", "更新位置 ↻")}
        </button>
      </div>
    );
  }

  // 5. idle / locating：定位仍在進行中，呼叫端自行顯示「正在定位中」的狀態。
  return null;
}
