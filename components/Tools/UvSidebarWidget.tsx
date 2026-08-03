"use client";

import { useNearestStation } from "@/components/Tools/useNearestStation";
import SidebarWidgetShell from "@/components/Tools/SidebarWidgetShell";
import { type NearestUvStation } from "@/app/api/uv/nearest/route";

export default function UvSidebarWidget() {
  const { station, showSpinner, isRefreshing, isDefault, refresh } =
    useNearestStation<NearestUvStation>("/api/uv/nearest");

  return (
    <SidebarWidgetShell
      dotColorClass="bg-amber-500"
      title="紫外線指數 (UV)"
      onRefresh={refresh}
      refreshing={isRefreshing}
      showSpinner={showSpinner}
      hasData={station !== null}
      footerHref="/tools/uv"
      footerLabel="查看全台 UV 指數地圖"
    >
      {station && (
        <>
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
          {isDefault && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">定位權限未開啟，顯示台北101鄰近資料</p>
          )}
        </>
      )}
    </SidebarWidgetShell>
  );
}
