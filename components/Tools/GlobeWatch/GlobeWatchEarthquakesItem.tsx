"use client";

import { useMemo, useRef, useState } from "react";
import type { SignificantEarthquake } from "@/lib/server/earthquakes/queries";
import {
  buildEarthquakeGlobeFeatureCollection,
  EARTHQUAKE_GLOBE_LEGEND,
  type EarthquakeGlobeFeatureProperties,
  type EarthquakeGlobeRow,
  type GdacsEqEventRow,
} from "@/lib/tools/globeWatch/earthquakeGlobeFeatures";
import { useLanguage } from "@/app/context/LanguageContext";
import GlobeWatchClient from "./GlobeWatchClient";
import GlobeWatchItemTabs from "./GlobeWatchItemTabs";
import EarthquakeContent from "./EarthquakeContent";

/**
 * Issue #588 (parent #583): composes this item's three pieces — the tab
 * switcher, the globe's earthquake data layer, and the existing
 * `EarthquakeContent` list — and owns the one piece of state the AC
 * requires sharing between them: the M4/M6/M7 magnitude filter (AC: "M4/M6/M7
 * 篩選同時套用在地球標記與清單").
 *
 * `earthquakes` (the server-rendered "顯著地震" list, unchanged rule) and
 * `globeRows` (the wider candidate set the globe's own threshold filters
 * down from — see lib/server/earthquakes/queries.ts's
 * getGlobeWatchEarthquakeCandidates) are two independent fetches on
 * purpose; this component never re-derives one from the other.
 *
 * `gdacsEvents` (issue #595, parent #583) is an optional third fetch (see
 * lib/server/gdacs/queries.ts's getRecentEqGdacsEvents) — purely additive,
 * so an empty/omitted array degrades to exactly #588's original behavior
 * (every marker colored by magnitude only, no popup GDACS line).
 */
export default function GlobeWatchEarthquakesItem({
  earthquakes,
  globeRows,
  gdacsEvents = [],
}: {
  earthquakes: SignificantEarthquake[];
  globeRows: EarthquakeGlobeRow[];
  gdacsEvents?: GdacsEqEventRow[];
}) {
  const { t } = useLanguage();
  const [filterMinMag, setFilterMinMag] = useState<number>(4.0);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const [flyTo, setFlyTo] = useState<{ lng: number; lat: number; flyToToken: number } | null>(null);
  const flyTokenRef = useRef(0);

  const featureCollection = useMemo(
    () => buildEarthquakeGlobeFeatureCollection(globeRows, { minMagnitude: filterMinMag, gdacsEvents }),
    [globeRows, filterMinMag, gdacsEvents],
  );

  // AC: "點擊清單項目時地球飛到該地震的位置" — the list's own rows
  // (SignificantEarthquake) never carry lat/lng, so the coordinates are
  // looked up from the wider globeRows candidate set by id instead of
  // re-fetching anything.
  const handleSelectListItem = (item: SignificantEarthquake) => {
    setSelectedId(item.id);
    const match = globeRows.find((row) => row.id === item.id);
    if (!match) return;
    flyTokenRef.current += 1;
    setFlyTo({ lng: match.lng, lat: match.lat, flyToToken: flyTokenRef.current });
  };

  const handleMarkerClick = (properties: EarthquakeGlobeFeatureProperties) => {
    setSelectedId(properties.id);
  };

  // Reused verbatim from earthquakesTool.* (the same labels EarthquakeContent
  // itself renders) so the globe popup and the list card never disagree on
  // wording — see GlobeWatchGlobe.tsx's EarthquakeGlobeLayerProps for how
  // these feed the (non-React) MapLibre Popup HTML.
  const popupLabels = {
    depthLabel: t("earthquakesTool.depthLabel", "深度:"),
    tsunamiLabel: t("earthquakesTool.tsunamiWarning", "🌊 海嘯警報"),
    sourceLinkLabel: t("earthquakesTool.officialReportLink", "官方測報 ↗"),
    unnamedPlaceholder: t("earthquakesTool.unnamedEpicenter", "未具名震央區域"),
    // Issue #595 (AC: "點擊有警戒色的地震標記，彈出內容包含 GDACS 警戒等級") — only
    // rendered by GlobeWatchGlobe.tsx's popup when the clicked feature
    // actually has a `gdacsAlertLevel` (i.e. a GDACS EQ event matched it).
    gdacsAlertLabel: t("earthquakesTool.gdacsAlertLevel", "GDACS 警戒等級:"),
  };

  return (
    <div className="space-y-6">
      <GlobeWatchItemTabs />

      <GlobeWatchClient
        earthquakes={{
          featureCollection,
          flyTo,
          onFeatureClick: handleMarkerClick,
          popupLabels,
        }}
      />

      {/* Magnitude-bucket legend (AC: 每個項目都有專屬圖例) — the exact same
          ladder GlobeWatchGlobe.tsx's circle layer paints with, imported
          from the one shared module so the two can't drift apart. */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span className="font-semibold text-slate-700 dark:text-slate-300">
          {t("globalWatchTool.earthquakes.legendHeading", "地球標記圖例：")}
        </span>
        {[...EARTHQUAKE_GLOBE_LEGEND].reverse().map((bucket) => (
          <span key={bucket.key} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block rounded-full"
              style={{ width: bucket.radiusPx, height: bucket.radiusPx, backgroundColor: bucket.color }}
            />
            {bucket.labelDefault}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-3 w-3 rounded-full border-2 border-red-600" />
          {t("globalWatchTool.earthquakes.legendTsunami", "海嘯警報")}
        </span>
      </div>

      <EarthquakeContent
        earthquakes={earthquakes}
        filterMinMag={filterMinMag}
        onFilterChange={setFilterMinMag}
        onSelect={handleSelectListItem}
        selectedId={selectedId}
      />
    </div>
  );
}
