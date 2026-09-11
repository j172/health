"use client";

import React, { useState, useEffect, useMemo } from "react";
import type { PestAlertItem, PestSurveyRecord } from "@/lib/server/pestAlerts/types";

export default function PestAlertsContent({
  initialAlerts = [],
}: {
  initialAlerts?: PestAlertItem[];
}) {
  const [alerts, setAlerts] = useState<PestAlertItem[]>(initialAlerts);
  const [loading, setLoading] = useState(initialAlerts.length === 0);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedLevel, setSelectedLevel] = useState<"all" | "紅燈" | "黃燈" | "綠燈">("all");
  const [expandedId, setExpandedId] = useState<number | string | null>(null);

  useEffect(() => {
    let ignore = false;
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/pest-alerts");
        if (res.ok) {
          const data = await res.json();
          if (!ignore && data.ok && Array.isArray(data.alerts)) {
            setAlerts(data.alerts);
          }
        }
      } catch (err) {
        console.error("Failed to fetch pest alerts:", err);
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
      if (selectedLevel !== "all" && a.warningLevel !== selectedLevel) return false;
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const matchName = a.subjectName.toLowerCase().includes(kw);
        const matchCrops = a.targetCrops.toLowerCase().includes(kw);
        if (!matchName && !matchCrops) return false;
      }
      return true;
    });
  }, [alerts, selectedLevel, searchKeyword]);

  return (
    <div className="space-y-6">
      {/* Intro Box */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-xl dark:bg-emerald-900/50">
            🌱
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              農作物病蟲害即時預警與疫情通報
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              整合農業部動植物防疫檢疫署自動監測系統，提供全台各鄉鎮病蟲害警訊與防治指引。
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-5 space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder="搜尋蟲害名稱（例：斜紋夜蛾、螟蛾）或受害作物（例：水稻、萵苣）..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:focus:bg-slate-900"
              />
              {searchKeyword && (
                <button
                  type="button"
                  onClick={() => setSearchKeyword("")}
                  className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setSelectedLevel("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedLevel === "all"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-500"
                }`}
              >
                全部燈號
              </button>
              <button
                type="button"
                onClick={() => setSelectedLevel("紅燈")}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedLevel === "紅燈"
                    ? "bg-white text-red-600 shadow-sm dark:bg-slate-900 dark:text-red-400"
                    : "text-slate-500"
                }`}
              >
                <span>🔴</span> 紅燈緊急
              </button>
              <button
                type="button"
                onClick={() => setSelectedLevel("黃燈")}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedLevel === "黃燈"
                    ? "bg-white text-amber-600 shadow-sm dark:bg-slate-900 dark:text-amber-400"
                    : "text-slate-500"
                }`}
              >
                <span>🟡</span> 黃燈注意
              </button>
              <button
                type="button"
                onClick={() => setSelectedLevel("綠燈")}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedLevel === "綠燈"
                    ? "bg-white text-emerald-600 shadow-sm dark:bg-slate-900 dark:text-emerald-400"
                    : "text-slate-500"
                }`}
              >
                <span>🟢</span> 綠燈正常
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alerts Grid */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
            <p className="mt-3 text-sm">正在載入病蟲害即時預警資料...</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="text-4xl">🌾</span>
            <h3 className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-200">
              查無符合條件的病蟲害預警
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              目前選取條件下無發布預警，代表監測狀況良好或請清除關鍵字後重試。
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert, idx) => {
            const isExpanded = expandedId === (alert.id || idx);
            let parsedData: any[] = [];
            try {
              if (alert.alertDataJson) parsedData = JSON.parse(alert.alertDataJson);
            } catch {}

            const records: PestSurveyRecord[] = [];
            if (Array.isArray(parsedData)) {
              for (const p of parsedData) {
                if (Array.isArray(p.SurveyRecord)) {
                  records.push(...p.SurveyRecord);
                }
              }
            }

            const levelColor =
              alert.warningLevel === "紅燈"
                ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                : alert.warningLevel === "黃燈"
                ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";

            return (
              <div
                key={alert.id || idx}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-emerald-300 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${levelColor}`}>
                        {alert.warningLevel || "綠燈"}
                      </span>
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {alert.monitorType}
                      </span>
                    </div>
                    <time className="text-xs text-slate-400">{alert.alertTime}</time>
                  </div>

                  <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">
                    {alert.subjectName}
                  </h3>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-slate-500 dark:text-slate-400">主要寄主/受害作物：</span>
                    {alert.targetCrops.split("、").map((crop, cIdx) => (
                      <span
                        key={cIdx}
                        className="rounded-md bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                      >
                        {crop}
                      </span>
                    ))}
                  </div>

                  {records.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs dark:border-slate-800">
                      <span className="text-slate-500">
                        收錄 <strong>{records.length}</strong> 個鄉鎮監測站點觀測數據
                      </span>
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : (alert.id || idx))}
                        className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                      >
                        {isExpanded ? "收合站點明細 ▲" : "查看監測鄉鎮明細 ▼"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Survey Records */}
                {isExpanded && records.length > 0 && (
                  <div className="bg-slate-50 p-4 border-t border-slate-100 dark:bg-slate-950/50 dark:border-slate-800">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 text-xs">
                      {records.map((rec, rIdx) => (
                        <div
                          key={rIdx}
                          className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900"
                        >
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {rec.CountyName} {rec.TownName}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {rec.CropName ? `作物: ${rec.CropName}` : `站號: ${rec.SurveySiteID}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
