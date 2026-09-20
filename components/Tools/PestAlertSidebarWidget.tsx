"use client";

import { useState } from "react";
import Link from "next/link";
import SidebarWidgetShell from "./SidebarWidgetShell";
import { useSidebarWidgetData } from "./useSidebarWidgetData";
import type { PestAlertItem } from "@/lib/server/pestAlerts/types";

export default function PestAlertSidebarWidget() {
  const { status, data, isRefreshing, refresh } = useSidebarWidgetData<PestAlertItem[]>({
    buildUrl: () => "/api/pest-alerts?limit=4",
    parse: (json) => {
      if (!json?.ok || !Array.isArray(json.alerts)) {
        throw new Error("Unexpected /api/pest-alerts payload");
      }
      return json.alerts;
    },
    deps: [],
  });

  const alerts = data ?? [];
  const hasError = status === "error";
  const showSpinner = status === "loading";

  const [mountTime] = useState(() => Date.now());

  const isRecentOrUrgent = (item: PestAlertItem) => {
    const isUrgent = item.warningLevel === "紅燈" || item.warningLevel === "黃燈";
    if (isUrgent) return true;
    if (!item.alertTime) return true;
    const t = new Date(item.alertTime).getTime();
    if (isNaN(t)) return true;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    return mountTime - t <= fourteenDaysMs;
  };

  const displayedAlerts = alerts.filter(isRecentOrUrgent).slice(0, 5);
  const hasUrgent = displayedAlerts.some((a) => a.warningLevel === "紅燈" || a.warningLevel === "黃燈");
  const dotColorClass = hasUrgent ? "bg-amber-500" : "bg-emerald-500";

  return (
    <SidebarWidgetShell
      dotColorClass={dotColorClass}
      title="🌱 作物病蟲害即時預警"
      onRefresh={refresh}
      refreshing={isRefreshing}
      showSpinner={showSpinner}
      hasData={displayedAlerts.length > 0}
      hasError={hasError}
      emptyMessage="暫無病蟲害通報"
      errorMessage="載入失敗，無法取得病蟲害預警"
      footerHref="/tools/pest-alerts"
      footerLabel="查看全台農作物病蟲害示警"
    >
      <div className="space-y-3">
        {displayedAlerts.map((item, idx) => {
          const badgeClass =
            item.warningLevel === "紅燈"
              ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
              : item.warningLevel === "黃燈"
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300";

          return (
            <Link
              key={item.id || idx}
              href="/tools/pest-alerts"
              className="block rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 transition hover:border-emerald-200 hover:bg-white dark:border-slate-800/80 dark:bg-slate-800/40 dark:hover:bg-slate-800"
            >
              <div className="flex items-center justify-between gap-1">
                <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${badgeClass}`}>
                  {item.warningLevel || "預警"}
                </span>
                <span className="text-[10px] text-slate-600">
                  {item.alertTime?.slice(5, 10) || "最新"}
                </span>
              </div>
              <h4 className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
                {item.subjectName}
              </h4>
              <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1">
                作物：{item.targetCrops || "各類農作"}
              </p>
            </Link>
          );
        })}
      </div>
    </SidebarWidgetShell>
  );
}
