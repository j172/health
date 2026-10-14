"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { AttributionControl, Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/i18n/dictionary";
import { buildLabelFieldExpression } from "@/lib/tools/globeWatch/basemapLabels";
import {
  GIBS_ATTRIBUTION_HTML,
  GIBS_MAX_NATIVE_ZOOM,
  GIBS_SATELLITE_TILE_URL,
  GIBS_TILE_SIZE,
  OPENFREEMAP_ATTRIBUTION_HTML,
  OPENFREEMAP_STYLE_URL,
  SATELLITE_RASTER_LAYER_ID,
  SATELLITE_RASTER_SOURCE_ID,
} from "@/lib/tools/globeWatch/basemapStyles";
import { RESET_VIEW_FLY_DURATION_MS, TAIWAN_DEFAULT_VIEW } from "@/lib/tools/globeWatch/defaultView";
import { resolveCameraTransition, resolveFlyDurationMs } from "@/lib/tools/globeWatch/motion";

type BasemapMode = "vector" | "satellite";

/**
 * Issue #587 (parent #583): the actual MapLibre globe. This module imports
 * `maplibre-gl` statically at its own top level, but the component is only
 * ever reached through `next/dynamic(() => import("./GlobeWatchGlobe"),
 * { ssr: false })` in GlobeWatchClient.tsx (same code-splitting convention
 * `components/DisasterMap/DisasterMapContent.tsx` uses for
 * DisasterMapLeaflet.tsx's static `leaflet` import) — so MapLibre never
 * ships in the initial page bundle, and never gets fetched at all when
 * WebGL isn't available (the parent gates rendering this component entirely
 * behind a WebGL probe, see lib/tools/globeWatch/webgl.ts).
 *
 * `projection: "globe"` is a built-in MapLibre GL JS feature: the globe
 * itself automatically unprojects to a flat Mercator map as the user zooms
 * in close (AC: "拉近到街道層級時轉為平面地圖") — nothing here needs to hand-code
 * that transition.
 */
export default function GlobeWatchGlobe({
  locale,
  reducedMotion,
}: {
  locale: Locale;
  reducedMotion: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("vector");
  const [attributionHtml, setAttributionHtml] = useState(OPENFREEMAP_ATTRIBUTION_HTML);

  // Mount once. Re-mounting on every `locale`/`reducedMotion` change would
  // flash a brand-new globe (and refetch the whole style) just to flip a
  // label field or an animation flag — both are instead applied to the
  // already-mounted map in the effects below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new MapLibreMap({
      container,
      style: OPENFREEMAP_STYLE_URL,
      center: TAIWAN_DEFAULT_VIEW.center,
      zoom: TAIWAN_DEFAULT_VIEW.zoom,
      pitch: TAIWAN_DEFAULT_VIEW.pitch,
      bearing: TAIWAN_DEFAULT_VIEW.bearing,
      attributionControl: false,
    });
    mapRef.current = map;

    // OpenFreeMap's "liberty" style defaults to a flat mercator projection
    // (it has no opinion on globe vs. mercator) — `setProjection` is
    // MapLibre's own typed, runtime API for switching to the globe
    // projection (AC: 可拖曳旋轉、縮放，拉近時自然轉為平面地圖). This is a
    // genuine MapLibre GL JS feature, not something hand-rolled here.
    map.setProjection({ type: "globe" });

    map.addControl(new NavigationControl({ visualizePitch: false, showCompass: true }), "top-left");

    map.on("load", () => {
      applyLocaleLabels(map, locale);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep basemap labels in sync with the page's current locale (AC: 底圖標籤
  // 依頁面語言挑選對應欄位) without re-mounting the map — including locale
  // switches that happen after the initial `load` event already fired.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      applyLocaleLabels(map, locale);
    } else {
      map.once("load", () => applyLocaleLabels(map, locale));
    }
  }, [locale]);

  // Vector/satellite toggle: adds the GIBS raster source/layer lazily (only
  // once, on first switch to satellite) rather than at mount time, so a
  // visitor who never touches the toggle never fetches a single GIBS tile.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      if (basemapMode === "satellite") {
        ensureSatelliteLayer(map);
        map.setLayoutProperty(SATELLITE_RASTER_LAYER_ID, "visibility", "visible");
        setAttributionHtml(`${OPENFREEMAP_ATTRIBUTION_HTML} · ${GIBS_ATTRIBUTION_HTML}`);
      } else if (map.getLayer(SATELLITE_RASTER_LAYER_ID)) {
        map.setLayoutProperty(SATELLITE_RASTER_LAYER_ID, "visibility", "none");
        setAttributionHtml(OPENFREEMAP_ATTRIBUTION_HTML);
      }
    };

    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [basemapMode]);

  // Attribution control only reads its `customAttribution` option at
  // construction time; swap the whole control when the attribution text
  // changes (vector-only vs vector+satellite) rather than trying to mutate
  // it in place.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const control = new AttributionControl({ customAttribution: attributionHtml });
    map.addControl(control, "bottom-right");
    return () => {
      try {
        map.removeControl(control);
      } catch {
        // Map may already be torn down (unmount race) — nothing left to clean up.
      }
    };
  }, [attributionHtml]);

  const handleReset = () => {
    const map = mapRef.current;
    if (!map) return;
    const mode = resolveCameraTransition(reducedMotion);
    if (mode === "jump") {
      map.jumpTo(TAIWAN_DEFAULT_VIEW);
    } else {
      map.flyTo({ ...TAIWAN_DEFAULT_VIEW, duration: resolveFlyDurationMs(reducedMotion, RESET_VIEW_FLY_DURATION_MS) });
    }
  };

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setBasemapMode((mode) => (mode === "vector" ? "satellite" : "vector"))}
          aria-pressed={basemapMode === "satellite"}
          className="rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md backdrop-blur-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
        >
          {basemapMode === "satellite" ? "🛰️ 衛星影像" : "🗺️ 向量地圖"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-md backdrop-blur-sm transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
        >
          🇹🇼 回到台灣
        </button>
      </div>
    </div>
  );
}

/** Adds the GIBS satellite raster source/layer if it isn't already on the map, inserted just below the first label layer so place names still draw on top of the imagery. */
function ensureSatelliteLayer(map: MapLibreMap): void {
  if (map.getLayer(SATELLITE_RASTER_LAYER_ID)) return;

  if (!map.getSource(SATELLITE_RASTER_SOURCE_ID)) {
    map.addSource(SATELLITE_RASTER_SOURCE_ID, {
      type: "raster",
      tiles: [GIBS_SATELLITE_TILE_URL],
      tileSize: GIBS_TILE_SIZE,
      maxzoom: GIBS_MAX_NATIVE_ZOOM,
    });
  }

  const firstSymbolLayerId = map
    .getStyle()
    ?.layers?.find((layer) => layer.type === "symbol")?.id;

  map.addLayer(
    {
      id: SATELLITE_RASTER_LAYER_ID,
      type: "raster",
      source: SATELLITE_RASTER_SOURCE_ID,
      layout: { visibility: "visible" },
    },
    firstSymbolLayerId,
  );
}

/** Applies the locale's basemap label fallback (AC: 底圖標籤依頁面語言) to every symbol layer whose text-field currently reads the plain `name` field. */
function applyLocaleLabels(map: MapLibreMap, locale: Locale): void {
  const expression = buildLabelFieldExpression(locale);
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type !== "symbol") continue;
    const textField = (layer as { layout?: { "text-field"?: unknown } }).layout?.["text-field"];
    if (textField === undefined) continue;
    try {
      // `setLayoutProperty`'s TS overload expects the exact per-property
      // style-spec expression type (not exported from the `maplibre-gl`
      // package's public types), while `buildLabelFieldExpression` stays
      // intentionally untyped-by-MapLibre (lib/tools/globeWatch/
      // basemapLabels.ts has zero MapLibre dependency, by design, so it's
      // plain-`node --test`-importable) — same kind of third-party-typing
      // mismatch components/Map/BaseMap.tsx already casts around for Leaflet.
      map.setLayoutProperty(layer.id, "text-field", expression as any);
    } catch {
      // A layer whose text-field isn't name-based (e.g. a POI icon label
      // keyed off a different field) is left untouched rather than crashing
      // the whole basemap over one incompatible layer.
    }
  }
}
