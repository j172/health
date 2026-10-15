"use client";

import type { Locale } from "@/lib/i18n/dictionary";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { resolveCountryName } from "@/lib/tools/globeWatch/epidemicsCountryNames";
import type { WhoDonPinFeature } from "@/lib/tools/globeWatch/whoDonTransform";

const POPUP_INTL_LOCALE: Record<Locale, string> = {
  "zh-TW": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
};

function formatPublishDate(iso: string, locale: Locale): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat(POPUP_INTL_LOCALE[locale] ?? "zh-TW", {
      dateStyle: "medium",
      timeZone: "Asia/Taipei",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Issue #597 (parent #583) — AC: "點擊圖釘顯示標題原文/疾病/國家/發布日期/
 * 連結". Shown below the globe whenever `GlobeWatchEpidemicsGlobe` reports a
 * WHO DON pin click, the same "additive, click-to-see-detail" pattern #589's
 * `GlobeWatchEpidemicsCountryPanel` already established for country clicks —
 * this is a sibling panel, not a replacement: selecting a WHO pin and
 * selecting a country are mutually exclusive but both reachable, and neither
 * one touches the other's data.
 */
export default function GlobeWatchWhoDonPinPanel({
  pin,
  locale,
  onClose,
}: {
  pin: WhoDonPinFeature;
  locale: Locale;
  onClose: () => void;
}) {
  const countryLabel = resolveCountryName(pin.iso, locale);

  return (
    <div
      className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      data-testid="globe-watch-who-don-pin-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
          🌐 {countryLabel}
          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">({pin.iso})</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="close"
          className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      </div>

      <p className="mt-2 text-sm font-bold text-slate-900 dark:text-slate-100" data-testid="who-don-pin-title">
        {pin.title}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-bold dark:bg-slate-800">
          🦠 {pin.disease}
        </span>
        <span>{formatPublishDate(pin.publishDate, locale)}</span>
      </div>

      {pin.url ? (
        <a
          href={appendOutboundUtm(pin.url, { medium: "who_don_source", campaign: "global_watch_epidemics" })}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          WHO 原文 ↗
        </a>
      ) : null}
    </div>
  );
}
