"use client";

import SidebarWidgetShell from "./SidebarWidgetShell";
import { useSidebarWidgetData } from "./useSidebarWidgetData";
import { type WaterOutageItem } from "@/app/api/water-outages/route";

export default function WaterOutageSidebarWidget() {
  const { status, data, isRefreshing, refresh } = useSidebarWidgetData<WaterOutageItem[]>({
    buildUrl: () => "/api/water-outages",
    parse: (json) => {
      if (!json?.ok || !Array.isArray(json.outages)) {
        throw new Error("Unexpected /api/water-outages payload");
      }
      return json.outages.slice(0, 3);
    },
    deps: [],
  });

  const outages = data ?? [];
  const hasData = outages.length > 0;
  const hasError = status === "error";
  const showSpinner = status === "loading";

  return (
    <SidebarWidgetShell
      dotColorClass="bg-blue-500"
      title="🚰 台水停水資訊"
      onRefresh={refresh}
      refreshing={isRefreshing}
      showSpinner={showSpinner}
      hasData={hasData}
      hasError={hasError}
      emptyMessage="一週內全台無重大突發或大規模停水通報。"
      errorMessage="載入失敗，無法取得停水通報"
      footerHref="https://web.water.gov.tw/wateroffmap/"
      footerLabel="前往台水即時停水地圖 →"
    >
      <div className="space-y-3">
        {outages.map((item) => (
          <div
            key={item.id}
            className="border-b border-slate-100 pb-2.5 last:border-0 last:pb-0 dark:border-slate-800"
          >
            <div className="flex items-center justify-between gap-1">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950/70 dark:text-blue-300">
                {item.county} {item.districts}
              </span>
              <span className="text-[10px] text-slate-600">
                {item.type}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
              {item.influenceArea || item.reason || "管線維修施工"}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-600 dark:text-slate-500">
              {item.startTime.slice(5, 16)} ~ {item.endTime.slice(5, 16)}
            </p>
          </div>
        ))}
      </div>
    </SidebarWidgetShell>
  );
}
