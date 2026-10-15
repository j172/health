"use client";

import type { TyphoonLegendEntry } from "@/lib/tools/globeWatch/typhoonsTransform";

/** Issue #593 — the typhoons item's own color legend (AC/spec: 每個項目專屬
 * 的圖例), same shape as GlobeWatchEpidemicsLegend.tsx. */
export default function GlobeWatchTyphoonsLegend({ legend }: { legend: TyphoonLegendEntry[] }) {
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400"
      data-testid="globe-watch-typhoons-legend"
    >
      {legend.map((entry) => (
        <span key={entry.key} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          {entry.labelDefault}
        </span>
      ))}
    </div>
  );
}
