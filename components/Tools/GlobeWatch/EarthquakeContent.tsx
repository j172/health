"use client";

import { useState } from "react";
import type { SignificantEarthquake } from "@/lib/server/earthquakes/queries";
import { useLanguage, type Locale } from "@/app/context/LanguageContext";
import { appendOutboundUtm } from "@/lib/format/outboundLink";

// Event time is always shown in Taiwan's local clock (Asia/Taipei) regardless
// of UI locale — only the date/time *formatting convention* (digit order,
// separators) follows the viewer's language.
const INTL_LOCALE: Record<Locale, string> = {
  "zh-TW": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
};

const toTaipeiTime = (value: Date | string | null, locale: Locale): string => {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(INTL_LOCALE[locale] ?? "zh-TW", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Asia/Taipei",
    }).format(new Date(value));
  } catch {
    return "";
  }
};

function safeToFixed(val: unknown, digits = 1): string {
  const num = typeof val === "number" ? val : parseFloat(String(val ?? ""));
  return isNaN(num) ? "0.0" : num.toFixed(digits);
}

type Translator = (key: string, defaultValue?: string) => string;

const getMagBadge = (t: Translator, magInput: unknown) => {
  const parsed =
    typeof magInput === "number"
      ? magInput
      : parseFloat(String(magInput ?? ""));
  const mag = isNaN(parsed) ? 0 : parsed;
  if (mag <= 0) {
    return {
      bg: "bg-slate-500 text-white dark:bg-slate-600",
      label: "M -",
    };
  }
  if (mag >= 7.0) {
    return {
      bg: "bg-red-500 text-white dark:bg-red-600",
      label: t("earthquakesTool.badgeStrongM7", "強震 M7.0+"),
    };
  }
  if (mag >= 6.0) {
    return {
      bg: "bg-amber-500 text-white dark:bg-amber-600",
      label: t("earthquakesTool.badgeSignificantM6", "顯著 M6.0+"),
    };
  }
  return {
    bg: "bg-indigo-500 text-white dark:bg-indigo-600",
    label: `M${safeToFixed(mag, 1)}`,
  };
};

export default function EarthquakeContent({
  earthquakes,
  filterMinMag: controlledFilterMinMag,
  onFilterChange,
  onSelect,
  selectedId,
}: {
  earthquakes: SignificantEarthquake[];
  /**
   * Issue #588 (parent #583): optional controlled-filter props, additive and
   * fully backward-compatible — when omitted, this component manages its
   * own `filterMinMag` state exactly as before. The global-watch earthquake
   * item (GlobeWatchEarthquakesItem.tsx) passes these to lift the M4/M6/M7
   * filter up so it drives the globe markers and this list together (AC:
   * "M4/M6/M7 篩選同時套用在地球標記與清單").
   *
   * Issue #590 (parent #583): this component used to live at
   * app/(zh)/tools/earthquakes/EarthquakeContent.tsx and be shared by both
   * that standalone page and this global-watch item; #590 retired the
   * standalone page (301s to the global-watch item now), so this moved here
   * as its one remaining caller.
   */
  filterMinMag?: number;
  onFilterChange?: (value: number) => void;
  /** When provided, each card becomes clickable/focusable (AC: "點擊清單項目時
   * 地球飛到該地震的位置" — this component itself has no globe access, it
   * just reports the click upward). */
  onSelect?: (item: SignificantEarthquake) => void;
  /** Visually highlights the currently-selected card (optional). */
  selectedId?: number | string | null;
}) {
  const [internalFilterMinMag, setInternalFilterMinMag] = useState<number>(4.0);
  const filterMinMag = controlledFilterMinMag ?? internalFilterMinMag;
  const setFilterMinMag = onFilterChange ?? setInternalFilterMinMag;
  const { locale, t, tDynamic } = useLanguage();

  const filtered = earthquakes.filter((e) => {
    const mag =
      typeof e.magnitude === "number"
        ? e.magnitude
        : parseFloat(String(e.magnitude ?? ""));
    return !isNaN(mag) && mag >= filterMinMag;
  });

  return (
    <div className="space-y-8">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 animate-ping rounded-full bg-amber-500" />
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {t("earthquakesTool.heading", "全台與全球顯著地震動態")}
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
            {t(
              "earthquakesTool.dataSource",
              "資料來源：中央氣象署 (CWA，全台 M4.0+) · 美國地質調查局 (USGS，全球 M6.0+)",
            )}
          </p>
        </div>

        {/* Magnitude Filter Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-auto">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            {t("earthquakesTool.filterLabel", "篩選規模：")}
          </span>
          {[
            { label: t("earthquakesTool.filterAll", "台灣+全球顯著"), val: 4.0 },
            { label: t("earthquakesTool.filterM6", "M6.0+ 顯著"), val: 6.0 },
            { label: t("earthquakesTool.filterM7", "M7.0+ 強震"), val: 7.0 },
          ].map((opt) => (
            <button
              key={opt.val}
              onClick={() => setFilterMinMag(opt.val)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                filterMinMag === opt.val
                  ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Earthquakes List Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-600 dark:border-slate-800 dark:bg-slate-900">
          {t("earthquakesTool.emptyState", "目前沒有符合此規模篩選條件的顯著地震紀錄。")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((item) => {
            const badge = getMagBadge(t, item.magnitude);
            const rawLoc =
              locale === "en"
                ? item.place?.trim() || item.place_zh?.trim()
                : item.place_zh?.trim() || item.place?.trim();
            // SPECIFICATION.md 4.3 — live API strings run through OpenCC for zh-CN.
            // The English branch above already prefers USGS's native item.place.
            const location = tDynamic(rawLoc) || t("earthquakesTool.unnamedEpicenter", "未具名震央區域");

            const isSelected = onSelect != null && selectedId != null && selectedId === item.id;

            return (
              <div
                key={item.id}
                onClick={onSelect ? () => onSelect(item) : undefined}
                onKeyDown={
                  onSelect
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(item);
                        }
                      }
                    : undefined
                }
                role={onSelect ? "button" : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-pressed={onSelect ? isSelected : undefined}
                className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border bg-white p-5 shadow-xs transition-all hover:border-indigo-300 hover:shadow-md dark:bg-slate-900 dark:hover:border-slate-700 ${
                  isSelected
                    ? "border-indigo-400 ring-2 ring-indigo-300 dark:border-indigo-600 dark:ring-indigo-700"
                    : "border-slate-200 dark:border-slate-800"
                } ${onSelect ? "cursor-pointer" : ""}`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-extrabold shadow-2xs ${badge.bg}`}
                    >
                      {badge.label}
                    </span>

                    {item.tsunami_warning === 1 && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-600 dark:bg-red-950 dark:text-red-300">
                        <span className="relative flex h-2 w-2 items-center justify-center">
                          <span className="animate-alert-ripple absolute inline-flex h-full w-full rounded-full bg-red-500" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-red-600" />
                        </span>
                        {t("earthquakesTool.tsunamiWarning", "🌊 海嘯警報")}
                      </span>
                    )}

                    <span className="text-xs text-slate-600">
                      {toTaipeiTime(item.event_time, locale)}
                    </span>
                  </div>

                  <h3 className="mt-3 line-clamp-2 text-base leading-snug font-bold text-slate-900 dark:text-slate-100">
                    📍 {location}
                  </h3>

                  {item.place && item.place_zh && (
                    <p className="mt-1 line-clamp-1 font-mono text-xs text-slate-600">
                      {item.place}
                    </p>
                  )}
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs dark:border-slate-800">
                  <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400">
                    {item.depth_km != null && (
                      <span>
                        {t("earthquakesTool.depthLabel", "深度:")}{" "}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {item.depth_km} km
                        </strong>
                      </span>
                    )}
                    {item.primary_source && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase dark:bg-slate-800 dark:text-slate-300">
                        {item.primary_source}
                      </span>
                    )}
                  </div>

                  {item.url && (
                    <a
                      href={appendOutboundUtm(item.url, {
                        medium: "tool_outbound",
                        campaign: "global_watch_earthquakes",
                      })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      {t("earthquakesTool.officialReportLink", "官方測報 ↗")}
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
