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
import type { TyphoonPointProperties, TyphoonsGlobeData } from "@/lib/tools/globeWatch/typhoonsTransform";

type BasemapMode = "vector" | "satellite";

const POINT_SOURCE_ID = "global-watch-typhoons-points";
const POINT_LAYER_ID = "global-watch-typhoons-points-circle";
const TRACK_SOURCE_ID = "global-watch-typhoons-tracks";
const TRACK_LINE_LAYER_ID = "global-watch-typhoons-tracks-line";

const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Issue #593 (parent #583) — the 颱風 (typhoons) item's own MapLibre globe.
 * A deliberate sibling of GlobeWatchGlobe.tsx (#587/#588) and
 * GlobeWatchEpidemicsGlobe.tsx (#589), per the same reasoning
 * GlobeWatchEpidemicsGlobe.tsx's own doc comment already gives: multiple
 * global-watch items can land concurrently, and editing one shared globe
 * file from several in-flight PRs is exactly the avoidable merge conflict
 * this ticket was asked to not repeat (see lib/tools/globeWatch/items.ts's
 * own doc comment for the real incident that already happened once with the
 * item-switcher registry). The duplicated MapLibre bootstrap
 * (style/projection/nav-control/attribution/reset/locale-labels) all comes
 * from the same shared pure modules #587 already extracted — only the
 * actual MapLibre glue is duplicated, not the decision logic (which lives
 * entirely in lib/tools/globeWatch/typhoonsTransform.ts).
 *
 * Reached only via `next/dynamic(() => import("./GlobeWatchTyphoonsGlobe"),
 * { ssr: false })` in GlobeWatchTyphoonsClient.tsx, gated behind the same
 * WebGL probe #587 established, and only ever mounted when there is at
 * least one active cyclone (`!data.emptyState`) — the empty-state message
 * is rendered by the caller instead (AC: 沒有任何活動颱風時顯示空狀態說明，不是
 * 空白地圖), so this component never needs to render that case itself,
 * matching #583's "地球元件只負責把 features 加到對應的 source／layer，不含任何業務
 * 邏輯" decision.
 */
export default function GlobeWatchTyphoonsGlobe({
  locale,
  reducedMotion,
  data,
  popupLabels,
}: {
  locale: Locale;
  reducedMotion: boolean;
  data: TyphoonsGlobeData;
  popupLabels: {
    westPacificLabel: string;
    sourceLinkLabel: string;
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

  // Mount once — same reasoning as GlobeWatchGlobe.tsx/GlobeWatchEpidemicsGlobe.tsx:
  // re-mounting on every data/locale change would refetch the whole style
  // just to update a few markers or a label field, both of which are
  // instead applied to the already-mounted map in the effects below.
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
      ensureTyphoonLayers(map);
      (map.getSource(POINT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(data.points);
      (map.getSource(TRACK_SOURCE_ID) as GeoJSONSource | undefined)?.setData(data.tracks);

      map.on("click", POINT_LAYER_ID, (e) => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.geometry.type !== "Point") return;
        const properties = feature.properties as unknown as TyphoonPointProperties;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        new Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px" })
          .setLngLat([lng, lat])
          .setHTML(buildTyphoonPopupHtml(properties, popupLabelsRef.current))
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

  // Keep the two GeoJSON sources in sync with the caller's data (e.g. a
  // revalidated page re-rendering with fresh listItems/points/tracks).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const pointSource = map.getSource(POINT_SOURCE_ID) as GeoJSONSource | undefined;
      pointSource?.setData(data.points ?? EMPTY_FEATURE_COLLECTION);
      const trackSource = map.getSource(TRACK_SOURCE_ID) as GeoJSONSource | undefined;
      trackSource?.setData(data.tracks ?? EMPTY_FEATURE_COLLECTION);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [data]);

  // Keep basemap labels in sync with the page's locale, same as the other two globes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) applyLocaleLabels(map, locale);
    else map.once("load", () => applyLocaleLabels(map, locale));
  }, [locale]);

  // Vector/satellite toggle — same lazy-add pattern as the other two globes.
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
      <div ref={containerRef} className="h-full w-full" data-testid="globe-watch-typhoons-map" />

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

function buildTyphoonPopupHtml(
  properties: TyphoonPointProperties,
  labels: { westPacificLabel: string; sourceLinkLabel: string },
): string {
  const name = escapeHtml(properties.name);
  const sourceLine =
    properties.source === "cwa"
      ? escapeHtml(labels.westPacificLabel)
      : escapeHtml(`GDACS${properties.basin ? ` · ${properties.basin}` : ""}${properties.alertLevel ? ` · ${properties.alertLevel}` : ""}`);
  const linkHtml = properties.web
    ? `<div style="margin-top:4px;"><a href="${escapeHtml(appendOutboundUtm(properties.web, { medium: "tool_outbound", campaign: "global_watch_typhoons" }))}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;font-weight:600;">${escapeHtml(labels.sourceLinkLabel)}</a></div>`
    : "";

  return `<div style="font-size:12px;line-height:1.6;min-width:180px;">
    <div style="font-weight:700;">${name}</div>
    <div>${sourceLine}</div>
    ${linkHtml}
  </div>`;
}

/**
 * Issue #593: creates the typhoon point + track GeoJSON sources/layers
 * (idempotent). The track line layer is added first so points draw on top
 * of it; point color comes straight from `markerColor`, already resolved by
 * lib/tools/globeWatch/typhoonsTransform.ts (no business logic lives here).
 */
function ensureTyphoonLayers(map: MapLibreMap): void {
  if (!map.getSource(TRACK_SOURCE_ID)) {
    map.addSource(TRACK_SOURCE_ID, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
  }
  if (!map.getSource(POINT_SOURCE_ID)) {
    map.addSource(POINT_SOURCE_ID, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });
  }

  const firstSymbolLayerId = map.getStyle()?.layers?.find((layer) => layer.type === "symbol")?.id;

  if (!map.getLayer(TRACK_LINE_LAYER_ID)) {
    map.addLayer(
      {
        id: TRACK_LINE_LAYER_ID,
        type: "line",
        source: TRACK_SOURCE_ID,
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": "#64748b", "line-width": 2, "line-dasharray": [2, 1.5] },
      },
      firstSymbolLayerId,
    );
  }

  if (!map.getLayer(POINT_LAYER_ID)) {
    map.addLayer(
      {
        id: POINT_LAYER_ID,
        type: "circle",
        source: POINT_SOURCE_ID,
        paint: {
          "circle-radius": 8,
          "circle-color": ["get", "markerColor"],
          "circle-opacity": 0.9,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 1.5,
        },
      },
      firstSymbolLayerId,
    );
  }
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
  const beforeId = map.getLayer(TRACK_LINE_LAYER_ID)
    ? TRACK_LINE_LAYER_ID
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
