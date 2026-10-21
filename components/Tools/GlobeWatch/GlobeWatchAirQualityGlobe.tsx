"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { AttributionControl, Map as MapLibreMap, NavigationControl } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import { configureMapLibreWorker } from "@/lib/tools/globeWatch/mapWorker";
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
import {
  buildWaqiTileUrl,
  WAQI_ATTRIBUTION_HTML,
  WAQI_MAX_NATIVE_ZOOM,
  WAQI_RASTER_LAYER_ID,
  WAQI_RASTER_SOURCE_ID,
  WAQI_TILE_SIZE,
} from "@/lib/tools/globeWatch/airQualityTiles";

type BasemapMode = "vector" | "satellite";

/**
 * Issue #598 (parent #583, phase 4) — the 全球空品 (global air quality)
 * item's own MapLibre globe. Deliberately a sibling of GlobeWatchGlobe.tsx
 * and GlobeWatchEpidemicsGlobe.tsx rather than an edit to either shared
 * file, same reasoning as GlobeWatchEpidemicsGlobe.tsx's own doc comment:
 * every global-watch item ships as its own PR and editing a file another
 * in-flight item ticket also touches is an avoidable merge conflict. The
 * duplicated MapLibre bootstrap (style/projection/nav-control/attribution/
 * reset/locale-labels) all comes from the same shared pure modules #587
 * already extracted.
 *
 * Unlike the satellite basemap toggle (added lazily, only once a visitor
 * switches to it) the WAQI raster overlay is added unconditionally at
 * `load` time — showing the AQI tiles IS this item's entire purpose, there
 * is no "off" state to lazily defer.
 *
 * Reached only via `next/dynamic(() => import("./GlobeWatchAirQualityGlobe"),
 * { ssr: false })` in GlobeWatchAirQualityClient.tsx, gated behind both the
 * WebGL probe #587 established AND a non-empty token (AC: 不支援 WebGL
 * 時...不嘗試載入地球 — and with no token configured, there is nothing
 * meaningful to load either).
 */
export default function GlobeWatchAirQualityGlobe({
  locale,
  reducedMotion,
  token,
}: {
  locale: Locale;
  reducedMotion: boolean;
  /** Never empty by the time this component actually mounts — the parent
   * client component gates rendering on `Boolean(token)` first. Always
   * flows straight into `buildWaqiTileUrl(token)`, never a hard-coded
   * literal (AC: token 不寫死在原始碼). */
  token: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("vector");
  const [attributionHtml, setAttributionHtml] = useState(`${OPENFREEMAP_ATTRIBUTION_HTML} · ${WAQI_ATTRIBUTION_HTML}`);

  // Mount once — same reasoning as GlobeWatchGlobe.tsx/GlobeWatchEpidemicsGlobe.tsx:
  // re-mounting on every locale change would refetch the whole style just to
  // flip a label field, which is instead applied to the already-mounted map
  // in the effect below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    configureMapLibreWorker();
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
    // `setProjection` throws "Style is not done loading" until the style is in, so it runs on `style.load`.
    map.on("style.load", () => map.setProjection({ type: "globe" }));
    map.addControl(new NavigationControl({ visualizePitch: false, showCompass: true }), "top-left");

    map.on("load", () => {
      applyLocaleLabels(map, locale);
      addWaqiLayer(map, token);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep basemap labels in sync with the page's locale, same as the other global-watch globes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) applyLocaleLabels(map, locale);
    else map.once("load", () => applyLocaleLabels(map, locale));
  }, [locale]);

  // Vector/satellite toggle — same lazy-add pattern as the other global-watch
  // globes. The WAQI raster layer stays visible either way (ensureSatelliteLayer
  // below stacks it beneath the WAQI layer so the AQI overlay is never hidden).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (basemapMode === "satellite") {
        ensureSatelliteLayer(map);
        map.setLayoutProperty(SATELLITE_RASTER_LAYER_ID, "visibility", "visible");
        setAttributionHtml(`${OPENFREEMAP_ATTRIBUTION_HTML} · ${GIBS_ATTRIBUTION_HTML} · ${WAQI_ATTRIBUTION_HTML}`);
      } else if (map.getLayer(SATELLITE_RASTER_LAYER_ID)) {
        map.setLayoutProperty(SATELLITE_RASTER_LAYER_ID, "visibility", "none");
        setAttributionHtml(`${OPENFREEMAP_ATTRIBUTION_HTML} · ${WAQI_ATTRIBUTION_HTML}`);
      }
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [basemapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const control = new AttributionControl({ customAttribution: attributionHtml });
    map.addControl(control, "bottom-right");
    return () => {
      try {
        map.removeControl(control);
      } catch {
        // Map may already be torn down (unmount race).
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
      <div ref={containerRef} className="h-full w-full" data-testid="globe-watch-air-quality-map" />

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

/**
 * Adds the WAQI raster source/layer (idempotent). Inserted below the first
 * symbol (label) layer so place-name labels still draw on top of the AQI
 * color blocks, same stacking convention `ensureSatelliteLayer` below and
 * the shared GIBS satellite layer already use.
 */
function addWaqiLayer(map: MapLibreMap, token: string): void {
  if (map.getSource(WAQI_RASTER_SOURCE_ID)) return;
  map.addSource(WAQI_RASTER_SOURCE_ID, {
    type: "raster",
    tiles: [buildWaqiTileUrl(token)],
    tileSize: WAQI_TILE_SIZE,
    maxzoom: WAQI_MAX_NATIVE_ZOOM,
  });
  const firstSymbolLayerId = map.getStyle()?.layers?.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    {
      id: WAQI_RASTER_LAYER_ID,
      type: "raster",
      source: WAQI_RASTER_SOURCE_ID,
      paint: { "raster-opacity": 0.75 },
    },
    firstSymbolLayerId,
  );
}

/** Same lazy-add GIBS satellite layer as GlobeWatchGlobe.tsx/GlobeWatchEpidemicsGlobe.tsx, stacked below the WAQI layer so the AQI overlay always stays visible on top of either basemap. */
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
  const beforeId = map.getLayer(WAQI_RASTER_LAYER_ID)
    ? WAQI_RASTER_LAYER_ID
    : map.getStyle()?.layers?.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    { id: SATELLITE_RASTER_LAYER_ID, type: "raster", source: SATELLITE_RASTER_SOURCE_ID, layout: { visibility: "visible" } },
    beforeId,
  );
}

function applyLocaleLabels(map: MapLibreMap, locale: Locale): void {
  const expression = buildLabelFieldExpression(locale);
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type !== "symbol") continue;
    const textField = (layer as { layout?: { "text-field"?: unknown } }).layout?.["text-field"];
    if (textField === undefined) continue;
    try {
      map.setLayoutProperty(layer.id, "text-field", expression as any);
    } catch {
      // A layer whose text-field isn't name-based is left untouched.
    }
  }
}
