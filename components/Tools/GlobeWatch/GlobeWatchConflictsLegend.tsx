"use client";

import type { ConflictLegendEntry } from "@/lib/tools/globeWatch/conflictsTransform";

/** Issue #774 — the conflicts item's own color legend (AC/spec: 每個項目專屬
 * 的圖例), same shape as GlobeWatchTyphoonsLegend.tsx. */
export default function GlobeWatchConflictsLegend({ legend }: { legend: ConflictLegendEntry[] }) {
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400"
      data-testid="globe-watch-conflicts-legend"
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
