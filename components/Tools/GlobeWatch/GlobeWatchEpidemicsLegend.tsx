"use client";

import type { EpidemicLegendEntry } from "@/lib/tools/globeWatch/epidemicsTransform";

const LEVEL_LABEL: Record<1 | 2 | 3, string> = {
  1: "第一級：注意 (Watch)",
  2: "第二級：警示 (Alert)",
  3: "第三級：警告 (Warning)",
};

/** Issue #589 — the item's own color legend (AC/spec: 每個項目專屬的圖例). */
export default function GlobeWatchEpidemicsLegend({ legend }: { legend: EpidemicLegendEntry[] }) {
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400"
      data-testid="globe-watch-epidemics-legend"
    >
      {legend.map((entry) => (
        <span key={entry.levelCode} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          {LEVEL_LABEL[entry.levelCode]}
        </span>
      ))}
    </div>
  );
}
