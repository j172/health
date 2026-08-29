"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SidebarWidgetShell from "./SidebarWidgetShell";
import { type WaterOutageItem } from "@/app/api/water-outages/route";

export default function WaterOutageSidebarWidget() {
  const [outages, setOutages] = useState<WaterOutageItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchOutages = async () => {
      try {
        const res = await fetch("/api/water-outages");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted && Array.isArray(data.outages)) {
          setOutages(data.outages.slice(0, 3));
        }
      } catch (err) {
        console.warn("Water outages fetch failed:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchOutages();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = () => {
    setLoading(true);
    fetch("/api/water-outages")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.outages)) setOutages(data.outages.slice(0, 3));
      })
      .finally(() => setLoading(false));
  };

  return (
    <SidebarWidgetShell
      dotColorClass="bg-blue-500"
      title="🚰 台水停水資訊"
      onRefresh={handleRefresh}
      refreshing={loading}
      showSpinner={loading && outages.length === 0}
      hasData={outages.length > 0}
      emptyMessage="一週內全台無重大突發或大規模停水通報。"
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
              <span className="text-[10px] text-slate-400">
                {item.type}
              </span>
            </div>
            <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-800 dark:text-slate-200">
              {item.influenceArea || item.reason || "管線維修施工"}
            </p>
            <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
              {item.startTime.slice(5, 16)} ~ {item.endTime.slice(5, 16)}
            </p>
          </div>
        ))}
      </div>
    </SidebarWidgetShell>
  );
}
