"use client";

import { useNearestStation } from "@/components/Tools/useNearestStation";
import SidebarWidgetShell from "@/components/Tools/SidebarWidgetShell";
import { type NearestAqiSite } from "@/app/api/aqi/nearest/route";

export default function AqiSidebarWidget() {
  const { station, showSpinner, isRefreshing, isDefault, refresh } =
    useNearestStation<NearestAqiSite>("/api/aqi/nearest");

  return (
    <SidebarWidgetShell
      dotColorClass="bg-emerald-500"
      title="即時空氣品質 (AQI)"
      onRefresh={refresh}
      refreshing={isRefreshing}
      showSpinner={showSpinner}
      hasData={station !== null}
      footerHref="/tools/aqi"
      footerLabel="查看全台 84 個測站 AQI 地圖"
    >
      {station && (
        <>
          <div className="flex items-baseline justify-between rounded-xl bg-slate-50 p-3.5 dark:bg-slate-800/60">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {station.county} · {station.siteName}測站 · 約 {station.distanceKm} km
              </p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{station.aqiValue ?? "--"}</span>
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white shadow-xs"
                  style={{ backgroundColor: station.aqiColor || "#10B981" }}
                >
                  {station.aqiStatus || "良好"}
                </span>
              </div>
            </div>
            {station.pm25 !== null && (
              <div className="text-right">
                <span className="block text-[10px] uppercase font-semibold text-slate-400">PM2.5</span>
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{station.pm25} μg/m³</span>
              </div>
            )}
          </div>
          {isDefault && (
            <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">定位權限未開啟，顯示台北101鄰近資料</p>
          )}
        </>
      )}
    </SidebarWidgetShell>
  );
}
