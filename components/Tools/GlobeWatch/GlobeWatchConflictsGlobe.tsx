"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type GeoJSONSource,
  type MapGeoJSONFeature,
} from "maplibre-gl";
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
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { resolveConflictRootName } from "@/lib/tools/globeWatch/conflictCameoRootNames";
import type { ConflictFeatureProperties, ConflictsGlobeData } from "@/lib/tools/globeWatch/conflictsTransform";

type BasemapMode = "vector" | "satellite";

const POINT_SOURCE_ID = "global-watch-conflicts-points";
const POINT_LAYER_ID = "global-watch-conflicts-points-circle";

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Issue #774 (parent #773) — the 武裝衝突 (conflicts) item's own MapLibre
 * globe. A deliberate sibling of GlobeWatchTyphoonsGlobe.tsx (#593) rather
 * than a new layer bolted onto the shared GlobeWatchGlobe.tsx — same
 * reasoning that file's own doc comment already gives for not growing the
 * earthquakes/disasters shared globe further: several Global Watch items
 * can land concurrently, and this item's single circle layer (no track
 * lines, no checkbox filter) is simple enough that duplicating the shared
 * MapLibre bootstrap (style/projection/nav-control/attribution/reset/
 * locale-labels — all from the same pure modules every globe component
 * already reuses) costs far less than the merge-conflict risk of editing
 * the shared file from an independent ticket.
 *
 * Reached only via `next/dynamic(() => import("./GlobeWatchConflictsGlobe"),
 * { ssr: false })` in GlobeWatchConflictsClient.tsx, gated behind the same
 * WebGL probe every other globe component uses, and only ever mounted when
 * there is at least one current event (`!data.emptyState`) — same contract
 * as GlobeWatchTyphoonsGlobe.
 */
export default function GlobeWatchConflictsGlobe({
  locale,
  reducedMotion,
  data,
  popupLabels,
}: {
  locale: Locale;
  reducedMotion: boolean;
  data: ConflictsGlobeData;
  popupLabels: {
    readOriginalLabel: string;
    unknownCountryLabel: string;
    fatalitiesLabel: string;
  };
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const localeRef = useRef(locale);
  const popupLabelsRef = useRef(popupLabels);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  useEffect(() => {
    popupLabelsRef.current = popupLabels;
  }, [popupLabels]);

  const [basemapMode, setBasemapMode] = useState<BasemapMode>("vector");
  const [attributionHtml, setAttributionHtml] = useState(OPENFREEMAP_ATTRIBUTION_HTML);

  // Mount once — same reasoning as every other globe component: re-mounting
  // on every data/locale change would refetch the whole style just to
  // update a handful of markers.
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
    map.on("style.load", () => map.setProjection({ type: "globe" }));
    map.addControl(new NavigationControl({ visualizePitch: false, showCompass: true }), "top-left");

    map.on("load", () => {
      applyLocaleLabels(map, locale);
      ensureConflictLayers(map);
      (map.getSource(POINT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(data.featureCollection);

      map.on("click", POINT_LAYER_ID, (e) => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.geometry.type !== "Point") return;
        const properties = feature.properties as unknown as ConflictFeatureProperties;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        new Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px" })
          .setLngLat([lng, lat])
          .setHTML(buildConflictPopupHtml(properties, localeRef.current, popupLabelsRef.current))
          .addTo(map);
      });
      map.on("mouseenter", POINT_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", POINT_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the GeoJSON source in sync with the caller's data.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const source = map.getSource(POINT_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(data.featureCollection ?? EMPTY_FEATURE_COLLECTION);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [data.featureCollection]);

  // Keep basemap labels in sync with the page's locale, same as every other globe.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) applyLocaleLabels(map, locale);
    else map.once("load", () => applyLocaleLabels(map, locale));
  }, [locale]);

  // Vector/satellite toggle — same lazy-add pattern as every other globe.
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
      <div ref={containerRef} className="h-full w-full" data-testid="globe-watch-conflicts-map" />

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

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

function buildConflictPopupHtml(
  properties: ConflictFeatureProperties,
  locale: Locale,
  labels: { readOriginalLabel: string; unknownCountryLabel: string; fatalitiesLabel: string },
): string {
  const rootLabel = escapeHtml(resolveConflictRootName(properties.rootCode, locale));
  const countryLabel = escapeHtml(properties.countryName || labels.unknownCountryLabel);
  const descriptionHtml = escapeHtml(properties.description);
  const fatalitiesHtml =
    properties.fatalitiesEstimate != null
      ? `<div>${escapeHtml(labels.fatalitiesLabel)} ${properties.fatalitiesEstimate}</div>`
      : "";
  const linkHtml = properties.sourceUrl
    ? `<div style="margin-top:4px;"><a href="${escapeHtml(appendOutboundUtm(properties.sourceUrl, { medium: "tool_outbound", campaign: "global_watch_conflicts" }))}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;font-weight:600;">${escapeHtml(labels.readOriginalLabel)}</a></div>`
    : "";

  return `<div style="font-size:12px;line-height:1.6;min-width:200px;">
    <div style="font-weight:700;">
      <span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escapeHtml(properties.markerColor)};margin-right:4px;"></span>
      ${rootLabel} · ${countryLabel}
    </div>
    <div style="margin-top:2px;color:#64748b;">${escapeHtml(properties.eventDate)}</div>
    <div style="margin-top:4px;color:#475569;">${descriptionHtml}</div>
    ${fatalitiesHtml}
    ${linkHtml}
  </div>`;
}

/**
 * Issue #774: creates the conflicts GeoJSON source + its one circle layer
 * (idempotent). Point color comes straight from `markerColor`, already
 * resolved by lib/tools/globeWatch/conflictsTransform.ts (no business logic
 * lives here — same contract every other globe component follows).
 */
function ensureConflictLayers(map: MapLibreMap): void {
  if (map.getSource(POINT_SOURCE_ID)) return;

  map.addSource(POINT_SOURCE_ID, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });

  const firstSymbolLayerId = map.getStyle()?.layers?.find((layer) => layer.type === "symbol")?.id;

  map.addLayer(
    {
      id: POINT_LAYER_ID,
      type: "circle",
      source: POINT_SOURCE_ID,
      paint: {
        "circle-radius": 8,
        "circle-color": ["get", "markerColor"],
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    },
    firstSymbolLayerId,
  );
}

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
  const beforeId = map.getLayer(POINT_LAYER_ID)
    ? POINT_LAYER_ID
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
