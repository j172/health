"use client";

import { useEffect, useState } from "react";
import SidebarWidgetShell from "./SidebarWidgetShell";
import type { CpcPriceSummary } from "@/lib/server/cpc/prices";

export default function CpcPriceSidebarWidget() {
  const [summary, setSummary] = useState<CpcPriceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/cpc-prices?summary=true");
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) {
        setSummary(data);
      }
    } catch (err) {
      console.warn("CPC price widget fetch failed:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchSummary();
  };

  const gas = summary?.gasoline;
  const ng = summary?.naturalGas;
  const hasData = Boolean(gas?.unleaded95 || gas?.unleaded92 || ng?.ng1);

  return (
    <SidebarWidgetShell
      dotColorClass="bg-blue-600 dark:bg-blue-400"
      title="⛽ 中油即時油價與天然氣"
      onRefresh={handleRefresh}
      refreshing={refreshing}
      showSpinner={loading && !hasData}
      hasData={hasData}
      emptyMessage="暫無最新中油牌價資料"
      footerHref="/tools/cpc-prices"
      footerLabel="查看完整 9 類油氣牌價表 →"
    >
      <div className="space-y-2.5">
        {summary?.effectiveDate && (
          <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              本期公告牌價
            </span>
            <span className="font-mono">{summary.effectiveDate} 起生效</span>
          </div>
        )}

        {/* 4-Grid for Gasoline & Diesel */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-2.5 dark:border-blue-900/40 dark:bg-blue-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900 dark:text-blue-200">95 無鉛</span>
              <span className="text-[10px] text-slate-400">元/公升</span>
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-blue-700 dark:text-blue-300">
              ${gas?.unleaded95?.price !== undefined ? gas.unleaded95.price.toFixed(1) : "--"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">92 無鉛</span>
              <span className="text-[10px] text-slate-400">元/公升</span>
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
              ${gas?.unleaded92?.price !== undefined ? gas.unleaded92.price.toFixed(1) : "--"}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-2.5 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">98 無鉛</span>
              <span className="text-[10px] text-slate-400">元/公升</span>
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-slate-800 dark:text-slate-100">
              ${gas?.unleaded98?.price !== undefined ? gas.unleaded98.price.toFixed(1) : "--"}
            </div>
          </div>

          <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-2.5 dark:border-amber-900/40 dark:bg-amber-950/20">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">超級柴油</span>
              <span className="text-[10px] text-slate-400">元/公升</span>
            </div>
            <div className="mt-1 text-lg font-bold tracking-tight text-amber-700 dark:text-amber-300">
              ${gas?.diesel?.price !== undefined ? gas.diesel.price.toFixed(1) : "--"}
            </div>
          </div>
        </div>

        {/* Natural Gas mini strip */}
        <div className="flex items-center justify-between rounded-lg bg-slate-100/80 px-2.5 py-1.5 text-xs dark:bg-slate-800/60">
          <span className="text-slate-600 dark:text-slate-300">
            🔥 天然氣 (公用):
          </span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            ${ng?.ng1?.price !== undefined ? ng.ng1.price.toFixed(2) : "14.71"}
            <span className="ml-1 text-[10px] font-normal text-slate-400">元/度</span>
          </span>
        </div>
      </div>
    </SidebarWidgetShell>
  );
}
