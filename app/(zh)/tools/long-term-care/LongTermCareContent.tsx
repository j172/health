"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import CareCircleMap from "@/components/Facilities/CareCircleMap";
import { facilitySearchConfigs } from "../facilityConfigs";

/**
 * issue #484 (2.0 §D merge item M4): merged "/tools/home-healthcare",
 * "/tools/elder-welfare" and "/tools/hakka-bogong" into this page ("長照照顧圈地圖")
 * as a type filter switching between 4 `facilitySearchConfigs` entries — the same
 * underlying pattern as the green-certifications tab family (#256/#448), just a
 * dedicated pill selector instead of the shared `ToolTypeTabs` component.
 *
 * `ToolTypeTabs` keeps its active tab as private internal state with no way for a
 * caller to read it. The new "照顧圈" panel below needs to know which type is
 * currently selected (to query `/api/facilities` for that exact type at a
 * user-chosen radius), so this page tracks the active key itself rather than
 * growing ToolTypeTabs' contract for what is, so far, its only caller with that
 * need.
 */
export const LONG_TERM_CARE_TYPE_KEYS = [
  "long-term-care",
  "home-healthcare",
  "elder-welfare",
  "hakka-bogong",
] as const;

export type LongTermCareTypeKey = (typeof LONG_TERM_CARE_TYPE_KEYS)[number];

interface LongTermCareTypeMeta {
  label: string;
  icon: string;
  /** Short noun for CareCircleMap's "圈內有 N 個◯◯" / widen-prompt copy. */
  resourceNoun: string;
}

const LONG_TERM_CARE_TYPE_META: Record<LongTermCareTypeKey, LongTermCareTypeMeta> = {
  "long-term-care": { label: "長照特約機構", icon: "🤝", resourceNoun: "長照機構" },
  "home-healthcare": { label: "居家醫療", icon: "🏠", resourceNoun: "居家醫療機構" },
  "elder-welfare": { label: "老人福利機構", icon: "👵", resourceNoun: "老人福利機構" },
  "hakka-bogong": { label: "伯公照護站", icon: "🧓", resourceNoun: "伯公照護站" },
};

/**
 * issue #484: "/tools/home-healthcare", "/tools/elder-welfare" and
 * "/tools/hakka-bogong" each 301 here with `?type=<key>` so the redirect lands
 * directly on the right facility type instead of the default. A pure function (no
 * React/Next hooks) so it is unit testable on its own: never trust the raw query
 * string — fall back to the first type (long-term-care itself) when it is missing
 * or not one of the known type keys.
 */
export function resolveInitialTypeKey(requestedType: string | null): LongTermCareTypeKey {
  return LONG_TERM_CARE_TYPE_KEYS.includes(requestedType as LongTermCareTypeKey)
    ? (requestedType as LongTermCareTypeKey)
    : LONG_TERM_CARE_TYPE_KEYS[0];
}

export default function LongTermCareContent() {
  const searchParams = useSearchParams();
  const [activeType, setActiveType] = useState<LongTermCareTypeKey>(() =>
    resolveInitialTypeKey(searchParams.get("type")),
  );

  const activeMeta = LONG_TERM_CARE_TYPE_META[activeType];

  return (
    <div className="space-y-6">
      {/* issue #615: outbound link to the new "長照給付與申請" tool, which
          covers the申請流程、長照3.0新制 and benefit-amount estimator that
          don't belong on this facility-search map page. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-indigo-200 bg-indigo-50/60 px-4 py-3 text-xs dark:border-indigo-900/50 dark:bg-indigo-950/20">
        <span className="text-slate-700 dark:text-slate-300">想了解長照給付額度與申請流程？</span>
        <Link
          href="/tools/ltc-benefits"
          className="inline-flex shrink-0 items-center gap-1 font-bold text-indigo-700 hover:underline dark:text-indigo-300"
        >
          長照給付與申請 →
        </Link>
      </div>

      <div role="tablist" aria-label="長照資源類型" className="flex flex-wrap gap-2">
        {LONG_TERM_CARE_TYPE_KEYS.map((key) => {
          const meta = LONG_TERM_CARE_TYPE_META[key];
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeType === key}
              onClick={() => setActiveType(key)}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-all ${
                activeType === key
                  ? "bg-indigo-600 text-white shadow-xs dark:bg-indigo-500"
                  : "border border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-indigo-700"
              }`}
            >
              <span>{meta.icon}</span>
              <span>{meta.label}</span>
            </button>
          );
        })}
      </div>

      <CareCircleMap
        facilityType={facilitySearchConfigs[activeType].facilityType}
        resourceNoun={activeMeta.resourceNoun}
      />

      <FacilitySearchContent config={facilitySearchConfigs[activeType]} />
    </div>
  );
}
