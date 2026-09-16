"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SidebarWidgetShell from "./SidebarWidgetShell";
import type { CongestionLevel } from "@/lib/server/emergencyRooms/types";

interface SidebarHospital {
  name: string;
  waitingConsultation: number;
  congestion: CongestionLevel;
  isFull: boolean;
}

export default function ErStatusSidebarWidget() {
  const [hospitals, setHospitals] = useState<SidebarHospital[]>([]);
  const [cityName, setCityName] = useState("雙北");
  const [hasFullReported, setHasFullReported] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchErWidget = async () => {
    try {
      const res = await fetch("/api/emergency-rooms?widget=true&city=TPE");
      if (res.ok) {
        const json = await res.json();
        if (json.ok && Array.isArray(json.hospitals)) {
          setHospitals(json.hospitals);
          if (json.cityName) setCityName(json.cityName);
          setHasFullReported(!!json.hasFullReported);
        }
      }
    } catch (err) {
      console.warn("ER widget fetch failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      fetchErWidget();
    });
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchErWidget();
  };

  const hasCritical = hospitals.some((h) => h.congestion === "critical" || h.isFull);
  const dotColorClass = hasFullReported
    ? "bg-red-500 animate-pulse"
    : hasCritical
    ? "bg-amber-500"
    : "bg-emerald-500";

  return (
    <SidebarWidgetShell
      dotColorClass={dotColorClass}
      title="🚨 急診即時就醫即時看板"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      showSpinner={loading}
      hasData={hospitals.length > 0}
      emptyMessage="暫無急診通報資料"
      footerHref="/tools/er-status"
      footerLabel="查看全台急診即時擁擠度看板"
    >
      <div className="space-y-2.5">
        <div className="flex items-center justify-between text-[11px] text-slate-500">
          <span>{cityName}主要責任醫院</span>
          <span>等待看診人數</span>
        </div>

        {hasFullReported && (
          <div className="rounded-lg bg-red-100 p-2 text-xs font-bold text-red-800 dark:bg-red-950/70 dark:text-red-200">
            ⚠️ 注意：部分醫院已向 119 通報滿線暫緩後送！
          </div>
        )}

        {hospitals.map((h, idx) => {
          const isCritical = h.congestion === "critical" || h.isFull;
          const isBusy = h.congestion === "busy";

          return (
            <Link
              key={idx}
              href="/tools/er-status"
              className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 transition-colors hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    h.isFull
                      ? "bg-red-600 animate-ping"
                      : isCritical
                      ? "bg-red-500"
                      : isBusy
                      ? "bg-amber-500"
                      : "bg-emerald-500"
                  }`}
                />
                <span className="text-xs font-bold text-slate-800 line-clamp-1 dark:text-slate-200">
                  {h.name}
                </span>
                {h.isFull && (
                  <span className="rounded bg-red-600 px-1 text-[10px] font-extrabold text-white">
                    滿線
                  </span>
                )}
              </div>

              <span
                className={`text-xs font-black ${
                  isCritical
                    ? "text-red-600 dark:text-red-400"
                    : isBusy
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-emerald-600 dark:text-emerald-400"
                }`}
              >
                {h.waitingConsultation} 人候診
              </span>
            </Link>
          );
        })}
      </div>
    </SidebarWidgetShell>
  );
}
