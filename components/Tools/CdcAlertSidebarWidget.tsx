"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import SidebarWidgetShell from "./SidebarWidgetShell";
import { type CDCTravelAlertItem, type CDCEpidemicNewsItem } from "@/app/api/cdc/travel-alerts/route";

export default function CdcAlertSidebarWidget() {
  const [activeTab, setActiveTab] = useState<"epid" | "travel">("epid");
  const [travelAlerts, setTravelAlerts] = useState<CDCTravelAlertItem[]>([]);
  const [epidNews, setEpidNews] = useState<CDCEpidemicNewsItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetchCdc = async () => {
      try {
        const res = await fetch("/api/cdc/travel-alerts");
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) {
          if (Array.isArray(data.alerts)) setTravelAlerts(data.alerts.slice(0, 5));
          if (Array.isArray(data.news)) setEpidNews(data.news.slice(0, 5));
        }
      } catch (err) {
        console.warn("CDC alerts fetch failed:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchCdc();
    return () => {
      isMounted = false;
    };
  }, []);

  const getSeverityBadge = (levelCode: number) => {
    switch (levelCode) {
      case 3:
        return "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300";
      case 2:
        return "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300";
      case 1:
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300";
      default:
        return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    fetch("/api/cdc/travel-alerts")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.alerts)) setTravelAlerts(data.alerts.slice(0, 5));
        if (Array.isArray(data.news)) setEpidNews(data.news.slice(0, 5));
      })
      .finally(() => setLoading(false));
  };

  return (
    <SidebarWidgetShell
      dotColorClass="bg-rose-500"
      title="🌍 疾管署公衛與旅遊警示"
      onRefresh={handleRefresh}
      refreshing={loading}
      showSpinner={loading && travelAlerts.length === 0 && epidNews.length === 0}
      hasData={travelAlerts.length > 0 || epidNews.length > 0}
      emptyMessage="暫無疾管署最新警示資料"
      footerHref="/tools/travel-epidemic-alerts"
      footerLabel="前往疾管署國際旅遊疫情地圖 →"
    >
      <div className="mb-3 flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold dark:bg-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab("epid")}
          className={`flex-1 rounded-md py-1 transition-all ${
            activeTab === "epid"
              ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          國際疫情 (前5筆)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("travel")}
          className={`flex-1 rounded-md py-1 transition-all ${
            activeTab === "travel"
              ? "bg-white text-indigo-600 shadow-xs dark:bg-slate-900 dark:text-indigo-400"
              : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          旅遊疫情警示 (前5筆)
        </button>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-4 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
          <div className="h-3 w-1/2 rounded bg-slate-200 dark:bg-slate-700" />
        </div>
      ) : activeTab === "epid" ? (
        <div className="space-y-3">
          {epidNews.length === 0 ? (
            <p className="text-xs text-slate-500">暫無國際疫情資訊。</p>
          ) : (
            epidNews.map((item) => (
              <div key={item.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-slate-800">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                    📍 {item.country}
                  </span>
                  {item.disease && (
                    <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:bg-rose-950/70 dark:text-rose-300">
                      {item.disease}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
                  {item.headline || item.description}
                </p>
                {item.effective && (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    {item.effective.slice(0, 10)}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {travelAlerts.length === 0 ? (
            <p className="text-xs text-slate-500">暫無旅遊警示資訊。</p>
          ) : (
            travelAlerts.map((item) => (
              <div key={item.id} className="border-b border-slate-100 pb-2 last:border-0 last:pb-0 dark:border-slate-800">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs text-slate-900 dark:text-slate-100">
                    ✈️ {item.country}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getSeverityBadge(item.levelCode)}`}>
                    {item.severityLevel || "注意"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                  {item.disease}：{item.instruction || item.alertTitle}
                </p>
                {item.effective && (
                  <p className="mt-0.5 text-[10px] text-slate-400">
                    發布日期：{item.effective.slice(0, 10)}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </SidebarWidgetShell>
  );
}
