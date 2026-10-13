"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import type { MetroAlertItem } from "@/lib/server/metroAlerts/types";
import { useLanguage } from "@/app/context/LanguageContext";

// 全台 6 個捷運／輕軌系統 + 臺鐵 + 高鐵，與 lib/server/metroAlerts/tdxClient.ts
// 的 RAIL_ALERT_SOURCES 對應（issue #470）。以 systemCode 精確比對，取代升級前
// 僅涵蓋臺北捷運各路線名稱子字串比對的 MRT_LINES。
//
// issue #486: `label` here doubles as each operator's own proper-noun name
// (臺北捷運、貓空纜車…、臺鐵、高鐵) — there is no separate English label
// field, so per the "government/institutional data stays Chinese" rule these
// stay hardcoded Chinese verbatim and are NOT run through t(). Only the
// "all systems" entry is generic UI chrome and gets a translated label.
function buildSystems(t: (key: string, defaultValue?: string) => string) {
  return [
    { id: "all", label: t("metroAlertsTool.systemAll", "全部系統"), color: "bg-slate-700 text-white" },
    { id: "TRTC", label: "臺北捷運", color: "bg-blue-600 text-white" },
    { id: "TRTCMG", label: "貓空纜車", color: "bg-lime-600 text-white" },
    { id: "TYMC", label: "桃園捷運", color: "bg-purple-600 text-white" },
    { id: "TMRT", label: "臺中捷運", color: "bg-orange-600 text-white" },
    { id: "KRTC", label: "高雄捷運", color: "bg-orange-500 text-white" },
    { id: "KLRT", label: "高雄輕軌", color: "bg-pink-600 text-white" },
    { id: "TRA", label: "臺鐵", color: "bg-sky-700 text-white" },
    { id: "THSR", label: "高鐵", color: "bg-rose-700 text-white" },
  ];
}

export default function MetroAlertsContent({ initialAlerts = [] }: { initialAlerts?: MetroAlertItem[] }) {
  const { t } = useLanguage();
  const SYSTEMS = useMemo(() => buildSystems(t), [t]);
  const [alerts, setAlerts] = useState<MetroAlertItem[]>(initialAlerts);
  const [loading, setLoading] = useState(initialAlerts.length === 0);
  const [selectedSystem, setSelectedSystem] = useState("all");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | "elevator" | "operational" | "suspended">("all");

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
      const systemCode = a.systemCode || "TRTC";
      if (selectedSystem !== "all" && systemCode !== selectedSystem) return false;
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
  }, [alerts, selectedSystem, selectedType, searchKeyword]);

  return (
    <div className="space-y-6">
      {/* 導流至全台無障礙交通地圖 */}
      <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-indigo-950/40 p-4 border border-blue-100 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="text-xl">♿</span>
          <div>
            <div className="text-xs font-bold text-blue-900 dark:text-blue-300">{t("metroAlertsTool.crossPromoTitle", "需要跨縣市或搭乘低地板公車？")}</div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">{t("metroAlertsTool.crossPromoDesc", "查看全台 22 縣市低地板公車比率、各縣市復康巴士與通用計程車專線")}</div>
          </div>
        </div>
        <Link
          href="/tools/accessible-transit"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap transition shadow-sm"
        >
          <span>{t("metroAlertsTool.crossPromoLink", "查看無障礙交通地圖")}</span>
          <span>→</span>
        </Link>
      </div>

      {/* Intro Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-xl dark:bg-blue-900/50">
            🚇
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              {t("metroAlertsTool.introHeading", "全台軌道營運通阻即時公告")}
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t(
                "metroAlertsTool.introDesc",
                "即時彙整全台 6 個捷運／輕軌系統（臺北捷運、貓空纜車、桃園捷運、臺中捷運、高雄捷運、高雄輕軌）、臺鐵、高鐵的營運通阻公告，以及臺北捷運各車站無障礙電梯檢修公告。"
              )}
            </p>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="mt-5 space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap gap-2">
            {SYSTEMS.map((system) => (
              <button
                key={system.id}
                onClick={() => setSelectedSystem(system.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  selectedSystem === system.id
                    ? `${system.color} shadow-sm ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900`
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                }`}
              >
                {system.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                placeholder={t("metroAlertsTool.searchPlaceholder", "搜尋車站／路線名稱（例：景安、臺北車站）或關鍵字...")}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-blue-500 focus:bg-white dark:border-slate-800 dark:bg-slate-950 dark:focus:bg-slate-900"
              />
              {searchKeyword && (
                <button
                  onClick={() => setSearchKeyword("")}
                  className="absolute right-3 top-2.5 text-xs text-slate-600 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex flex-wrap rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
              <button
                onClick={() => setSelectedType("all")}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedType === "all"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {t("metroAlertsTool.filterAll", "全部公告")}
              </button>
              <button
                onClick={() => setSelectedType("suspended")}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedType === "suspended"
                    ? "bg-white text-red-600 shadow-sm dark:bg-slate-900 dark:text-red-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>🛑</span> {t("metroAlertsTool.typeSuspended", "全線停駛")}
              </button>
              <button
                onClick={() => setSelectedType("operational")}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedType === "operational"
                    ? "bg-white text-amber-600 shadow-sm dark:bg-slate-900 dark:text-amber-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>⚠️</span> {t("metroAlertsTool.typeOperational", "營運調整")}
              </button>
              <button
                onClick={() => setSelectedType("elevator")}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  selectedType === "elevator"
                    ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                <span>🛗</span> {t("metroAlertsTool.typeElevator", "電梯檢修")}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Alert List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-600">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <p className="mt-3 text-sm">{t("metroAlertsTool.loadingText", "正在載入全台軌道即時公告...")}</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
            <span className="text-4xl">🟢</span>
            <h3 className="mt-3 text-base font-semibold text-slate-800 dark:text-slate-200">
              {t("metroAlertsTool.emptyHeading", "目前全線營運正常")}
            </h3>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {searchKeyword || selectedSystem !== "all" || selectedType !== "all"
                ? t("metroAlertsTool.emptyFilteredDesc", "目前選取的條件查無公告，您可切換回全部系統或清除關鍵字。")
                : t("metroAlertsTool.emptyNoneDesc", "目前全台軌道系統設備運作良好，無通阻或暫停使用通報。")}
            </p>
          </div>
        ) : (
          filteredAlerts.map((alert, idx) => {
            const systemLabel = alert.systemLabel || alert.lineName;
            return (
              <div
                key={alert.externalId || idx}
                className={`group relative overflow-hidden rounded-2xl border p-5 shadow-sm transition hover:shadow-md ${
                  alert.alertType === "suspended"
                    ? "border-red-200/80 bg-gradient-to-r from-red-50/50 via-white to-white dark:border-red-900/30 dark:from-red-950/20 dark:via-slate-900 dark:to-slate-900"
                    : "border-amber-200/80 bg-gradient-to-r from-amber-50/50 via-white to-white dark:border-amber-900/30 dark:from-amber-950/20 dark:via-slate-900 dark:to-slate-900"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-bold ${
                        alert.alertType === "elevator"
                          ? "bg-blue-500/10 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300"
                          : alert.alertType === "suspended"
                          ? "bg-red-500/10 text-red-700 dark:bg-red-400/10 dark:text-red-300"
                          : "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300"
                      }`}
                    >
                      {alert.alertType === "elevator"
                        ? `🛗 ${t("metroAlertsTool.typeElevator", "電梯檢修")}`
                        : alert.alertType === "suspended"
                        ? `🛑 ${t("metroAlertsTool.typeSuspended", "全線停駛")}`
                        : `⚠️ ${t("metroAlertsTool.typeOperational", "營運調整")}`}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {systemLabel}
                    </span>
                    {alert.stationName ? (
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {alert.stationName}
                      </span>
                    ) : null}
                  </div>
                  <time className="text-xs text-slate-600 dark:text-slate-500">
                    {alert.alertTime}
                  </time>
                </div>

                <h4 className="mt-2.5 text-base font-semibold text-slate-800 dark:text-slate-100">
                  {alert.alertTitle}
                </h4>

                <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {alert.alertContent}
                </p>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600 dark:border-slate-800">
                  <span>
                    {t("metroAlertsTool.sourceLabel", "資訊來源：")}
                    {systemLabel === "臺北捷運" ? "臺北大眾捷運股份有限公司" : "交通部 TDX 運輸資料流通服務"}
                    {t("metroAlertsTool.openDataSuffix", "開放資料")}
                  </span>
                  <span
                    className={`font-medium ${
                      alert.alertType === "suspended"
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {t("metroAlertsTool.statusOngoing", "進行中")}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
