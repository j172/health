"use client";

import { useState } from "react";
import Link from "next/link";

interface NewsMapCardProps {
  lat: number;
  lng: number;
  locationName: string;
  facilityId?: number | null;
  /**
   * Set when the coordinates are a district centroid rather than a real address.
   * The marker is then only good to within a kilometre or so, so the card drops
   * the 4-decimal coordinate readout (which asserts ~11m precision it does not
   * have) and re-labels itself 約略位置 instead of 相關地理位置. The map itself
   * still renders — a district-level pin is genuinely useful, it just must not
   * present itself as a survey point.
   */
  approximate?: boolean;
}

export default function NewsMapCard({
  lat,
  lng,
  locationName,
  facilityId,
  approximate = false,
}: NewsMapCardProps) {
  const [showInteractive, setShowInteractive] = useState(false);

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - 0.015}%2C${lat - 0.01}%2C${lng + 0.015}%2C${lat + 0.01}&layer=mapnik&marker=${lat}%2C${lng}`;

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/80 p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/80 transition-all">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">
            📍
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <span>{approximate ? "約略位置" : "相關地理位置"}</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.2 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                {locationName}
              </span>
            </h3>
            {approximate ? null : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                {lat.toFixed(4)}°N, {lng.toFixed(4)}°E
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setShowInteractive(!showInteractive)}
            className="cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-750 transition-colors"
          >
            {showInteractive ? "收起互動地圖" : "展開互動地圖 🗺️"}
          </button>
        </div>
      </div>

      {showInteractive ? (
        <div className="relative mb-4 h-64 w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          <iframe
            title={`地圖 - ${locationName}`}
            src={osmEmbedUrl}
            className="h-full w-full border-0"
            loading="lazy"
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 text-xs">
        {facilityId ? (
          <Link
            href={`/facilities/${facilityId}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors"
          >
            <span>🏥 檢視醫療機構資訊</span>
          </Link>
        ) : null}

        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750 transition-colors"
        >
          <span>Google 地圖導航 ↗</span>
        </a>

        <a
          href={osmUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700 shadow-xs hover:bg-slate-50 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-750 transition-colors"
        >
          <span>OpenStreetMap 檢視 ↗</span>
        </a>
      </div>
    </div>
  );
}
