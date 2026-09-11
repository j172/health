"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { MetroAlertItem } from "@/lib/server/metroAlerts/types";

const MRT_LINES = [
  { id: "all", label: "全部路線", color: "bg-slate-700 text-white" },
  { id: "板南線", label: "板南線", color: "bg-blue-600 text-white" },
  { id: "淡水信義線", label: "淡水信義線", color: "bg-red-600 text-white" },
  { id: "中和新蘆線", label: "中和新蘆線", color: "bg-amber-600 text-white" },
  { id: "松山新店線", label: "松山新店線", color: "bg-emerald-600 text-white" },
  { id: "文湖線", label: "文湖線", color: "bg-yellow-700 text-white" },
  { id: "環狀線", label: "環狀線", color: "bg-amber-400 text-black" },
];

export default function MetroAlertsContent({ initialAlerts = [] }: { initialAlerts?: MetroAlertItem[] }) {
  const [alerts, setAlerts] = useState<MetroAlertItem[]>(initialAlerts);
  const [loading, setLoading] = useState(initialAlerts.length === 0);
  const [selectedLine, setSelectedLine] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | "elevator" | "operational">("all");

  useEffect(() => {
    let ignore = false;
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/metro-alerts");
        if (res.ok) {
          const data = await res.json();
          if (!ignore && data.ok && Array.isArray(data.alerts)) {
            setAlerts(data.alerts);
          }
        }
      } catch (err) {
        console.error("Failed to fetch metro alerts:", err);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    fetchAlerts();
    return () => {
      ignore = true;
    };
  }, []);

  const filteredAlerts = useMemo(() => {
    return alerts.filter((a) => {
      if (selectedLine !== "all" && !a.lineName.includes(selectedLine)) return false;
      if (selectedType !== "all" && a.alertType !== selectedType) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const matchStation = a.stationName.toLowerCase().includes(kw);
        const matchTitle = a.alertTitle.toLowerCase().includes(kw);
        const matchDesc = a.alertContent.toLowerCase().includes(kw);
        if (!matchStation && !matchTitle && !matchDesc) return false;
      }
      return true;
    });
  }, [alerts, selectedLine, selectedType, searchKeyword]);

  return (
    <div className="space-y-6">
      {/* Intro Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl dark:bg-blue-900/50">
            🚇
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              臺北捷運營運與無障礙電梯即時公告
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              即時同步臺北大眾捷運股份有限公司營運資訊，包含各車站無障礙電梯保養檢修及特別班次動態。
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-5 space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            {MRT_LINES.map((line) => (
              <button
                key={line.id}
                onClick={() => setSelectedLine(line.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  selectedLine === line.id
                    ? `${line.color} shadow-sm ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {line.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜尋車站名稱（例：景安、台北車站）或關鍵字..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:focus:bg-slate-900"
              />
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword("")}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                onClick={() => setSelectedType("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedType === "all"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                全部公告
              </button>
              <button
                onClick={() => setSelectedType("elevator")}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedType === "elevator"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>🛗</span> 電梯檢修
              </button>
              <button
                onClick={() => setSelectedType("operational")}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedType === "operational"
                    ? "bg-white text-amber-600 shadow-sm dark:bg-slate-900 dark:text-amber-400"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>⚠️</span> 營運調整
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="mt-3 text-sm">正在載入捷運即時公告...</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="text-4xl">🟢</span>
            <h3 className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-200">
              目前全線營運正常
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {searchKeyword || selectedLine !== "all" || selectedType !== "all"
                ? "目前選取的條件查無公告，您可切換回全部路線或清除關鍵字。"
                : "目前捷運全線設備及電梯運作良好，無維護中或暫停使用通報。"}
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert, idx) => (
            <div
              key={alert.externalId || idx}
              className="group relative overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/50 via-white to-white p-5 shadow-sm transition hover:shadow-md dark:border-amber-900/30 dark:from-amber-950/20 dark:via-slate-900 dark:to-slate-900"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
                    {alert.alertType === "elevator" ? "🛗 電梯檢修" : "⚠️ 營運公告"}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {alert.lineName}
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white">
                    {alert.stationName}
                  </span>
                </div>
                <time className="text-xs text-slate-400 dark:text-slate-500">
                  {alert.alertTime}
                </time>
              </div>

              <h4 className="mt-2.5 text-base font-semibold text-slate-800 dark:text-slate-100">
                {alert.alertTitle}
              </h4>

              <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {alert.alertContent}
              </p>

              <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-400 dark:border-slate-800">
                <span>資訊來源：臺北大眾捷運股份有限公司開放資料</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">進行中</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
