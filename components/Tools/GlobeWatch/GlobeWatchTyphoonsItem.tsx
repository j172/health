"use client";

import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildLocalizedPath } from "@/lib/i18n/translatedPages";
import type { TyphoonsGlobeData } from "@/lib/tools/globeWatch/typhoonsTransform";
import GlobeWatchItemTabs from "./GlobeWatchItemTabs";
import GlobeWatchTyphoonsClient from "./GlobeWatchTyphoonsClient";
import GlobeWatchTyphoonsLegend from "./GlobeWatchTyphoonsLegend";

const SOURCE_LABEL: Record<"cwa" | "gdacs", string> = {
  cwa: "中央氣象署（西太平洋）",
  gdacs: "GDACS",
};

/**
 * Issue #593 (parent #583) — composes the typhoons item's tab switcher,
 * globe, legend, and server-rendered list (AC: 伺服器端輸出清單，
 * 沒有活動颱風時顯示空狀態). `data` is computed once, server-side, in this
 * item's page.tsx (see GlobeWatchTyphoonsClient.tsx's own doc comment for
 * why) — this component owns no data-fetching of its own.
 *
 * AC: "沒有任何活動颱風時，顯示明確的『目前無活動中的熱帶氣旋』說明" — the list below
 * the globe shows the exact same message when `data.emptyState` is true,
 * so a visitor who can't see the globe (WebGL unsupported, or just hasn't
 * scrolled to it) still gets the same explicit answer from the list alone
 * (AC: 不支援 WebGL 時清單維持完整可用).
 *
 * AC: "一鍵連到「氣象警報」工具頁" — the link below always uses
 * buildLocalizedPath so it resolves to the right locale (weather-alerts is
 * already a TRANSLATED_TOOL_SLUGS entry — see lib/i18n/translatedPages.ts).
 */
export default function GlobeWatchTyphoonsItem({ data }: { data: TyphoonsGlobeData }) {
  const { locale, t } = useLanguage();
  const weatherAlertsHref = buildLocalizedPath("/tools/weather-alerts", locale);

  return (
    <div className="space-y-6">
      <GlobeWatchItemTabs />

      <GlobeWatchTyphoonsClient data={data} />

      <GlobeWatchTyphoonsLegend legend={data.legend} />

      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("globalWatchTool.typhoons.listHeading", "目前活動中的熱帶氣旋")}
          </h2>
          <Link
            href={weatherAlertsHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
          >
            🇹🇼 {t("globalWatchTool.typhoons.weatherAlertsLink", "查看台灣氣象警報 ↗")}
          </Link>
        </div>

        {data.emptyState ? (
          <p
            data-testid="globe-watch-typhoons-empty-state"
            className="py-6 text-center text-sm text-slate-500 dark:text-slate-400"
          >
            🌀 {t("globalWatchTool.typhoons.emptyState", "目前無活動中的熱帶氣旋。")}
          </p>
        ) : (
          <ul className="space-y-2" data-testid="globe-watch-typhoons-list">
            {data.listItems.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{item.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {SOURCE_LABEL[item.source]}
                    {item.basin && item.source === "gdacs" ? ` · ${item.basin}` : ""}
                    {item.alertLevel ? ` · ${item.alertLevel}` : ""}
                  </span>
                </div>
                {item.lat != null && item.lng != null && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    目前位置：北緯 {item.lat.toFixed(1)}° / 東經 {item.lng.toFixed(1)}°
                  </p>
                )}
                {item.detail && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.detail}</p>}
                {item.web && (
                  <a
                    href={item.web}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    {item.source === "cwa" ? "路徑潛勢／官方頁面 ↗" : "詳細資訊 ↗"}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
