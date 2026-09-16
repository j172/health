"use client";

import { useNearestStation } from "@/components/Tools/useNearestStation";
import SidebarWidgetShell from "@/components/Tools/SidebarWidgetShell";
import { type NearestUvStation } from "@/app/api/uv/nearest/route";

export default function UvSidebarWidget() {
  const { station, showSpinner, isRefreshing, isDefault, refresh } =
    useNearestStation<NearestUvStation>("/api/uv/nearest");

  // 當前是否處於夜間無陽光時段 (18:00 ~ 06:00)
  const isNight = typeof window !== "undefined" && (() => {
    const hour = new Date().getHours();
    return hour >= 18 || hour < 6;
  })();

  const fallbackStation: NearestUvStation = isNight
    ? {
        stationId: "night",
        stationName: "夜間",
        county: "全區",
        uvIndex: 0,
        uvLabel: "微量 (夜間安全)",
        uvColor: "#16a34a",
        distanceKm: 0,
      }
    : {
        stationId: "default",
        stationName: "臺北",
        county: "臺北市",
        uvIndex: 1,
        uvLabel: "微量",
        uvColor: "#16a34a",
        distanceKm: 2,
      };

  const displayStation = station ?? fallbackStation;

  return (
    <SidebarWidgetShell
      dotColorClass="bg-amber-500"
      title="紫外線指數 (UV)"
      onRefresh={refresh}
      refreshing={isRefreshing}
      showSpinner={showSpinner}
      hasData={true}
      footerHref="/tools/uv"
      footerLabel="查看全台 UV 指數地圖"
    >
      <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
        <div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
            {displayStation.county ?? "未知地區"} · {displayStation.stationName ?? "測站"}測站
            {displayStation.distanceKm > 0 ? ` · 約 ${displayStation.distanceKm} km` : ""}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{displayStation.uvIndex}</span>
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-xs"
              style={{ backgroundColor: displayStation.uvColor || "#16a34a" }}
            >
              {displayStation.uvLabel}
            </span>
          </div>
        </div>
      </div>
      {isDefault && (
        <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">定位權限未開啟，顯示預設地區資料</p>
      )}
    </SidebarWidgetShell>
  );
}
