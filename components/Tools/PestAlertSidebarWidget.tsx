"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SidebarWidgetShell from "./SidebarWidgetShell";
import type { PestAlertItem } from "@/lib/server/pestAlerts/types";

export default function PestAlertSidebarWidget() {
  const [alerts, setAlerts] = useState<PestAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchAlerts = async () => {
    try {
      const res = await fetch("/api/pest-alerts?limit=4");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.alerts)) {
          setAlerts(data.alerts);
        }
      }
    } catch (err) {
      console.warn("Pest alerts widget fetch failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchAlerts();
  };

  const hasUrgent = alerts.some((a) => a.warningLevel === "紅燈" || a.warningLevel === "黃燈");
  const dotColorClass = hasUrgent ? "bg-amber-500" : "bg-emerald-500";

  return (
    <SidebarWidgetShell
      dotColorClass={dotColorClass}
      title="🌱 作物病蟲害即時預警"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      showSpinner={loading}
      hasData={alerts.length > 0}
      emptyMessage="暫無病蟲害通報"
      footerHref="/tools/pest-alerts"
      footerLabel="查看全台農作物病蟲害示警"
    >
      <div className="space-y-3">
        {alerts.map((item, idx) => {
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
                <span className="text-[10px] text-slate-400">
                  {item.alertTime?.slice(5, 10) || "最新"}
                </span>
              </div>
              <h4 className="mt-1 text-xs font-bold text-slate-800 dark:text-slate-100 line-clamp-1">
                {item.subjectName}
              </h4>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                作物：{item.targetCrops || "各類農作"}
              </p>
            </Link>
          );
        })}
      </div>
    </SidebarWidgetShell>
  );
}
