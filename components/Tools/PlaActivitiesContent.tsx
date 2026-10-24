"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { PlaActivityItem } from "@/lib/server/plaActivities/queries";

export interface PlaActivitiesContentProps {
  activities: PlaActivityItem[];
  initialDate?: string;
}

export default function PlaActivitiesContent({
  activities,
  initialDate,
}: PlaActivitiesContentProps) {
  // Determine initial selected date: prop or latest activity date
  const defaultDate = useMemo(() => {
    if (initialDate && activities.some((a) => a.activityDate === initialDate)) {
      return initialDate;
    }
    return activities[0]?.activityDate ?? "";
  }, [activities, initialDate]);

  const [selectedDate, setSelectedDate] = useState<string>(defaultDate);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [imageError, setImageError] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Sync with browser URL / popstate
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Check query params if not provided in initialDate
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get("date");
    if (dateParam && activities.some((a) => a.activityDate === dateParam)) {
      setSelectedDate(dateParam);
    }

    const handlePopState = () => {
      const p = new URLSearchParams(window.location.search);
      const d = p.get("date");
      if (d && activities.some((a) => a.activityDate === d)) {
        setSelectedDate(d);
      } else if (activities[0]?.activityDate) {
        setSelectedDate(activities[0].activityDate);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activities]);

  // Current active activity
  const current = useMemo(() => {
    return (
      activities.find((a) => a.activityDate === selectedDate) ??
      activities[0] ?? {
        activityDate: "",
        periodStart: null,
        periodEnd: null,
        title: "查無動態資料",
        aircraftTotal: 0,
        aircraftCrossed: 0,
        vesselsTotal: 0,
        officialShipsTotal: 0,
        description: "目前無相關海空域動態公報。",
        aircraftDetails: null,
        imageUrl: null,
        sourceUrl: "https://www.mnd.gov.tw/news/plaactlist",
      }
    );
  }, [activities, selectedDate]);

  // Handle switching date & deep linking
  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date);
    setImageError(false);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("date", date);
      window.history.replaceState(null, "", url.toString());
    }
  }, []);

  // Handle Esc to close lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isLightboxOpen) {
        setIsLightboxOpen(false);
      }
    };
    if (isLightboxOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isLightboxOpen]);

  // Copy verbatim announcement text
  const handleCopyText = useCallback(() => {
    if (!current.description) return;
    navigator.clipboard.writeText(current.description).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [current.description]);

  // Date format helper: YYYY-MM-DD -> MM/DD (週X)
  const formatShortDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-").map(Number);
    if (parts.length < 3) return dateStr;
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const weekdays = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
    const month = String(parts[1]).padStart(2, "0");
    const day = String(parts[2]).padStart(2, "0");
    return `${month}/${day} ${weekdays[d.getUTCDay()]}`;
  };

  // Alert level color helper for crossed line
  const crossedColorClass = useMemo(() => {
    if (current.aircraftCrossed === 0) {
      return "text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800";
    }
    if (current.aircraftCrossed <= 10) {
      return "text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800";
    }
    return "text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800";
  }, [current.aircraftCrossed]);

  return (
    <div className="space-y-8" data-testid="pla-activities-container">
      {/* Top Banner & Date indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
        <div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 mb-1">
            國防部即時公報
          </span>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            {current.title}
          </h2>
          {current.periodStart && current.periodEnd && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              統計週期：{current.periodStart} 至 {current.periodEnd}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-700 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 shadow-sm">
            活動日期：<strong>{current.activityDate}</strong>
          </span>
        </div>
      </div>

      {/* 4 Responsive KPI Metric Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Aircraft */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-sm">
            <span>偵獲共機總數</span>
            <span aria-hidden="true" className="text-lg">🛩️</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {current.aircraftTotal}
            </span>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              架次
            </span>
          </div>
          <div className="mt-2">
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded-md font-semibold ${
                current.aircraftTotal >= 30
                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                  : current.aircraftTotal >= 10
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {current.aircraftTotal >= 30
                ? "大規模活動"
                : current.aircraftTotal >= 10
                ? "常態巡航"
                : "低強度活動"}
            </span>
          </div>
        </div>

        {/* Metric 2: Crossed Median Line / Airspace */}
        <div
          className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between transition-colors ${crossedColorClass}`}
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">逾越中線及延伸空域</span>
            <span aria-hidden="true" className="text-lg">⚠️</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold">
              {current.aircraftCrossed}
            </span>
            <span className="text-sm font-medium">架次</span>
          </div>
          <div className="mt-2 text-xs truncate" title={current.aircraftDetails ?? "未逾越海峽中線"}>
            {current.aircraftCrossed > 0
              ? current.aircraftDetails ?? "進入周邊空域"
              : "今日未進入延伸空域"}
          </div>
        </div>

        {/* Metric 3: Naval Vessels */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-sm">
            <span>海軍艦艇</span>
            <span aria-hidden="true" className="text-lg">🚢</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {current.vesselsTotal}
            </span>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              艘次
            </span>
          </div>
          <div className="mt-2">
            <span className="inline-block text-xs px-2 py-0.5 rounded-md font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              海上持續監控
            </span>
          </div>
        </div>

        {/* Metric 4: Official Ships */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-sm">
            <span>公務船 / 海警船</span>
            <span aria-hidden="true" className="text-lg">⚓</span>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-900 dark:text-white">
              {current.officialShipsTotal}
            </span>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
              艘次
            </span>
          </div>
          <div className="mt-2">
            <span
              className={`inline-block text-xs px-2 py-0.5 rounded-md font-semibold ${
                current.officialShipsTotal > 0
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {current.officialShipsTotal > 0 ? "海巡聯合應處" : "未偵獲"}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content Area: Verbatim Bulletin + Airspace Trajectory Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Official Announcement (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 dark:bg-blue-400"></span>
                國防部官方公報全文
              </h3>
              <button
                type="button"
                onClick={handleCopyText}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="複製公報內容"
              >
                {copied ? "✓ 已複製" : "複製內文"}
              </button>
            </div>

            <blockquote className="text-slate-700 dark:text-slate-300 text-sm sm:text-base leading-relaxed tracking-wide bg-slate-50/70 dark:bg-slate-800/40 p-4 rounded-xl border-l-4 border-blue-500">
              {current.description}
            </blockquote>

            <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
              <p>資料來源：中華民國國防部全球資訊網即時軍事動態</p>
              <a
                href={current.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                國防部原始新聞公告
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>

          {/* Airspace crossing breakdown if available */}
          {current.aircraftCrossed > 0 && current.aircraftDetails && (
            <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              <p className="font-semibold mb-1">空域活動詳情：</p>
              <p>{current.aircraftDetails}</p>
            </div>
          )}
        </div>

        {/* Right Column: Airspace Trajectory Map (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400"></span>
                進入臺海周邊空域活動示意圖
              </h3>
              <span className="text-xs text-slate-400 dark:text-slate-500">點擊放大檢視</span>
            </div>

            {/* Image display with fallback */}
            {current.imageUrl && !imageError ? (
              <div
                className="relative group cursor-pointer overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-[4/3] flex items-center justify-center"
                onClick={() => setIsLightboxOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setIsLightboxOpen(true);
                }}
                aria-label="點擊放大活動示意圖"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={current.imageUrl}
                  alt={`${current.activityDate} 國防部進入臺海周邊空域活動示意圖`}
                  referrerPolicy="no-referrer"
                  onError={() => setImageError(true)}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-slate-950/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="px-3 py-1.5 rounded-lg bg-black/75 text-white text-xs font-semibold backdrop-blur-sm">
                    🔍 點擊查看高清大圖
                  </span>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-center space-y-3">
                <div className="text-3xl" aria-hidden="true">🗺️</div>
                <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {imageError ? "公部門示意圖暫時無法直接預覽" : "本日未附空域示意圖"}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  {imageError
                    ? "受限於國防部防盜鏈或伺服器維護，您可直接前往國防部官方公告檢視原始圖檔。"
                    : "一般當日無越界或低強度活動時，國防部僅以新聞文字公報發布。"}
                </p>
                <a
                  href={current.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline pt-1"
                >
                  前往國防部網站查看 ↗
                </a>
              </div>
            )}

            <p className="text-xs text-slate-400 dark:text-slate-500 leading-normal">
              示意圖呈現中共各型主、輔戰機及無人機進入我國防空識別區 (ADIZ) 之航跡與區域分佈。
            </p>
          </div>
        </div>
      </div>

      {/* Bottom 30-Day Timeline Selector */}
      <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              歷史時序切換（近 30 天動態紀錄）
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              點擊任一日期快速切換焦點數據與公報全文，支援深層網址分享
            </p>
          </div>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            共 {activities.length} 天紀錄
          </span>
        </div>

        {/* Date cards grid / horizontal scroll */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-2.5">
          {activities.map((item) => {
            const isSelected = item.activityDate === current.activityDate;
            const hasCrossed = item.aircraftCrossed > 0;

            return (
              <button
                key={item.activityDate}
                type="button"
                onClick={() => handleSelectDate(item.activityDate)}
                className={`p-3 rounded-xl border text-left transition-all relative flex flex-col justify-between min-h-[85px] ${
                  isSelected
                    ? "border-blue-500 bg-blue-50/70 dark:bg-blue-950/50 dark:border-blue-500 ring-2 ring-blue-500/20"
                    : "border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-bold ${
                        isSelected
                          ? "text-blue-700 dark:text-blue-300"
                          : "text-slate-800 dark:text-slate-200"
                      }`}
                    >
                      {formatShortDate(item.activityDate)}
                    </span>
                    {isSelected && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-400" />
                    )}
                  </div>
                  <div className="mt-1 flex items-baseline gap-1 text-slate-900 dark:text-white">
                    <span className="text-base font-extrabold">
                      {item.aircraftTotal}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      機
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      /
                    </span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                      {item.vesselsTotal}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      艦
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px]">
                  {hasCrossed ? (
                    <span className="px-1.5 py-0.5 rounded font-medium bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300">
                      {item.aircraftCrossed} 逾越
                    </span>
                  ) : (
                    <span className="px-1.5 py-0.5 rounded font-medium bg-slate-200/60 text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                      無逾越
                    </span>
                  )}
                  {item.officialShipsTotal > 0 && (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold" title={`公務船 ${item.officialShipsTotal} 艘`}>
                      +{item.officialShipsTotal}船
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Lightbox Modal */}
      {isLightboxOpen && current.imageUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="活動示意圖高清放大"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setIsLightboxOpen(false)}
        >
          <div
            className="relative max-w-5xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl flex flex-col border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 text-white">
              <span className="text-sm font-semibold truncate pr-4">
                {current.activityDate} 進入臺海周邊空域活動示意圖
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={current.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-xs rounded bg-slate-700 hover:bg-slate-600 text-slate-200 transition-colors"
                >
                  前往官網 ↗
                </a>
                <button
                  type="button"
                  onClick={() => setIsLightboxOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  aria-label="關閉燈箱"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Image Body */}
            <div className="overflow-auto p-2 flex items-center justify-center max-h-[calc(90vh-60px)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.imageUrl}
                alt={`${current.activityDate} 國防部進入臺海周邊空域活動示意圖高清放大`}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[80vh] object-contain rounded"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
