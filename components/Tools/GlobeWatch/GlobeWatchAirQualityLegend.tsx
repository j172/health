"use client";

import { AQI_LEGEND } from "@/lib/tools/globeWatch/airQualityTiles";

/** Issue #598 — the item's own color legend (spec: 每個項目專屬的圖例，例如...AQI 色階), same pattern as GlobeWatchEpidemicsLegend.tsx. */
export default function GlobeWatchAirQualityLegend() {
  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-400"
      data-testid="globe-watch-air-quality-legend"
    >
      {AQI_LEGEND.map((entry) => (
        <span key={entry.min} className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ backgroundColor: entry.color }}
            aria-hidden="true"
          />
          {entry.min}
          {entry.max !== null ? `–${entry.max}` : "+"} {entry.labelZh}
        </span>
      ))}
    </div>
  );
}
