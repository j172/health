"use client";

import type { Locale } from "@/lib/i18n/dictionary";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { resolveCountryName } from "@/lib/tools/globeWatch/epidemicsCountryNames";
import { resolveDiseaseName } from "@/lib/tools/globeWatch/epidemicsDiseaseNames";
import type { EpidemicCountryGroup } from "@/lib/tools/globeWatch/epidemicsTransform";

const LEVEL_BADGE: Record<1 | 2 | 3, { emoji: string; className: string }> = {
  1: { emoji: "🟡", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300" },
  2: { emoji: "🟠", className: "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300" },
  3: { emoji: "🔴", className: "bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300" },
};

/**
 * Issue #589 (parent #583) — AC: "點擊國家顯示該國所有疾病/等級/建議/疾管
 * 署連結". Shown below the globe whenever `GlobeWatchEpidemicsGlobe` reports
 * a country click. This is additive to (not a replacement for) the
 * carried-over `TravelEpidemicAlertsContent` list — the list already has
 * every disease/level/instruction/link with no globe interaction required
 * at all, which is what satisfies the WebGL-unsupported fallback AC;
 * clicking a country on the globe is a quicker shortcut to the same
 * information for a country the visitor is actually looking at on the map.
 */
export default function GlobeWatchEpidemicsCountryPanel({
  group,
  locale,
  onClose,
}: {
  group: EpidemicCountryGroup;
  locale: Locale;
  onClose: () => void;
}) {
  const firstDisease = group.diseases[0];
  const countryLabel = resolveCountryName(group.iso, locale, firstDisease?.country || firstDisease?.countryEn);

  return (
    <div
      className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs dark:border-slate-800 dark:bg-slate-900"
      data-testid="globe-watch-epidemics-country-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100">
          {countryLabel}
          <span className="ml-2 text-xs font-normal text-slate-500 dark:text-slate-400">({group.iso})</span>
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

      <ul className="mt-3 space-y-3">
        {group.diseases.map((disease, idx) => {
          const badge = LEVEL_BADGE[disease.levelCode];
          return (
            <li
              key={`${disease.id}-${idx}`}
              className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-800/60"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-slate-900 dark:text-slate-100">
                  🦠 {resolveDiseaseName(disease.disease, locale)}
                </span>
                <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${badge.className}`}>
                  {badge.emoji} {disease.severityLevel}
                </span>
              </div>
              {disease.instruction ? (
                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300">{disease.instruction}</p>
              ) : null}
              {disease.web ? (
                <a
                  href={appendOutboundUtm(disease.web, { medium: "epidemic_source", campaign: "global_watch_epidemics" })}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
                >
                  疾管署說明 ↗
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
