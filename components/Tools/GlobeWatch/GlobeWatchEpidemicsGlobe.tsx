"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import {
  AttributionControl,
  Map as MapLibreMap,
  NavigationControl,
  type MapGeoJSONFeature,
  type MapMouseEvent,
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
import {
  buildCountryFillColorExpression,
  EPIDEMIC_BORDER_LINE_COLOR,
  EPIDEMIC_BOUNDARIES_URL,
  EPIDEMIC_BOUNDARY_ISO_PROPERTY,
  EPIDEMIC_NEUTRAL_FILL_COLOR,
} from "@/lib/tools/globeWatch/epidemicsBoundaries";
import type { EpidemicPointFeature, EpidemicsGlobeData } from "@/lib/tools/globeWatch/epidemicsTransform";
import type { WhoDonPinFeature } from "@/lib/tools/globeWatch/whoDonTransform";

type BasemapMode = "vector" | "satellite";

const COUNTRY_SOURCE_ID = "global-watch-epidemics-countries";
const COUNTRY_FILL_LAYER_ID = "global-watch-epidemics-countries-fill";
const COUNTRY_LINE_LAYER_ID = "global-watch-epidemics-countries-line";
const POINT_SOURCE_ID = "global-watch-epidemics-points";
const POINT_LAYER_ID = "global-watch-epidemics-points-layer";
// Issue #597 (parent #583): WHO DON pin overlay — its own source/layer, kept
// entirely separate from COUNTRY_SOURCE_ID/COUNTRY_FILL_LAYER_ID above so
// toggling it on/off (via the `whoPins` prop, already filtered to `[]` when
// hidden by the caller — see GlobeWatchEpidemicsClient.tsx) can never affect
// the choropleth (AC: 關閉切換後圖釘從地球上消失，國家上色不受影響).
const WHO_PIN_SOURCE_ID = "global-watch-epidemics-who-pins";
const WHO_PIN_LAYER_ID = "global-watch-epidemics-who-pins-layer";
const WHO_PIN_COLOR = "#7c3aed"; // violet-600 — visually distinct from the level 1/2/3 choropleth/point colors

/**
 * Issue #589 (parent #583) — the 國際疫情 (epidemics) item's own MapLibre
 * globe. Deliberately a sibling of `GlobeWatchGlobe.tsx` (#587's
 * shell-only globe) rather than an edit to that shared file: issue #588
 * (地震/earthquakes) is specced to extend the same shell concurrently, and
 * two independently-landing PRs editing the one file both items would
 * otherwise share is exactly the kind of avoidable merge conflict the
 * orchestrating ticket asked this PR to minimize. The duplicated ~40 lines
 * of MapLibre bootstrap (style/projection/nav-control/attribution/reset/
 * locale-labels) all come from the same shared pure modules #587 already
 * extracted (`basemapLabels`, `basemapStyles`, `defaultView`, `motion`), so
 * only the actual MapLibre glue is duplicated, not the decision logic.
 *
 * Reached only via `next/dynamic(() => import("./GlobeWatchEpidemicsGlobe"),
 * { ssr: false })` in GlobeWatchEpidemicsClient.tsx, gated behind the same
 * WebGL probe #587 established — so this file (and the country-boundary
 * GeoJSON it fetches) is never requested unless WebGL is actually
 * available (AC: 不支援 WebGL 時...不嘗試載入地球).
 */
export default function GlobeWatchEpidemicsGlobe({
  locale,
  reducedMotion,
  data,
  selectedIso,
  onSelectCountry,
  whoPins,
  onSelectWhoPin,
}: {
  locale: Locale;
  reducedMotion: boolean;
  data: EpidemicsGlobeData;
  selectedIso: string | null;
  onSelectCountry: (iso: string | null) => void;
  /** Issue #597 (parent #583): already filtered by the caller to `[]` when
   * the "顯示 WHO 通報" toggle is off — see filterVisibleWhoDonPins in
   * lib/tools/globeWatch/whoDonTransform.ts. This component just mirrors
   * whatever list it's given into the WHO-pin source; it owns no
   * show/hide state of its own. */
  whoPins: WhoDonPinFeature[];
  onSelectWhoPin: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const boundariesLoadedRef = useRef(false);
  const dataRef = useRef(data);
  const onSelectCountryRef = useRef(onSelectCountry);
  const whoPinsRef = useRef(whoPins);
  const onSelectWhoPinRef = useRef(onSelectWhoPin);

  // "Latest ref" pattern: these mirror the current `data`/`onSelectCountry`/
  // `whoPins`/`onSelectWhoPin` props for the mount-once effect below (which
  // reads them from event callbacks, not from render) to read without being
  // retriggered by every data/callback-identity change. Assigning `.current`
  // must happen in an effect, not during render itself (react-hooks/refs).
  useEffect(() => {
    dataRef.current = data;
  }, [data]);
  useEffect(() => {
    onSelectCountryRef.current = onSelectCountry;
  }, [onSelectCountry]);
  useEffect(() => {
    whoPinsRef.current = whoPins;
  }, [whoPins]);
  useEffect(() => {
    onSelectWhoPinRef.current = onSelectWhoPin;
  }, [onSelectWhoPin]);

  const [basemapMode, setBasemapMode] = useState<BasemapMode>("vector");
  const [attributionHtml, setAttributionHtml] = useState(OPENFREEMAP_ATTRIBUTION_HTML);
  const [boundariesReady, setBoundariesReady] = useState(false);

  // Mount once — same reasoning as GlobeWatchGlobe.tsx: re-mounting on every
  // locale/data change would refetch the whole style just to flip a label
  // field or recolor a few countries, both of which are instead applied to
  // the already-mounted map in the effects below.
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
      loadCountryBoundaries(map, dataRef.current, () => setBoundariesReady(true));
      addPointLayer(map, dataRef.current.points);
      addWhoPinLayer(map, whoPinsRef.current);
      wireClickHandlers(map, onSelectCountryRef, onSelectWhoPinRef);
    });

    return () => {
      boundariesLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep basemap labels in sync with the page's locale, same as GlobeWatchGlobe.tsx.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) applyLocaleLabels(map, locale);
    else map.once("load", () => applyLocaleLabels(map, locale));
  }, [locale]);

  // Recolor the choropleth whenever the underlying data changes (e.g. a
  // retry after a failed fetch) without re-fetching the boundary file.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundariesReady) return;
    if (!map.getLayer(COUNTRY_FILL_LAYER_ID)) return;
    map.setPaintProperty(
      COUNTRY_FILL_LAYER_ID,
      "fill-color",
      buildCountryFillColorExpression(data.countries, data.legend, EPIDEMIC_BOUNDARY_ISO_PROPERTY) as any,
    );
    updatePointSource(map, data.points);
  }, [data, boundariesReady]);

  // Keep the WHO-pin source in sync with `whoPins` — including the toggle's
  // hide case, where the caller already passed `[]` (AC: 關閉切換後圖釘從地
  // 球上消失，國家上色不受影響 — this effect never touches COUNTRY_* ids).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => updateWhoPinSource(map, whoPins);
    if (map.isStyleLoaded() && map.getSource(WHO_PIN_SOURCE_ID)) apply();
    else map.once("load", apply);
  }, [whoPins]);

  // Highlight the selected country with a thicker border.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !boundariesReady || !map.getLayer(COUNTRY_LINE_LAYER_ID)) return;
    map.setPaintProperty(COUNTRY_LINE_LAYER_ID, "line-width", [
      "case",
      ["==", ["get", EPIDEMIC_BOUNDARY_ISO_PROPERTY], selectedIso ?? "__none__"],
      3,
      0.6,
    ] as any);
  }, [selectedIso, boundariesReady]);

  // Vector/satellite toggle — same lazy-add pattern as GlobeWatchGlobe.tsx.
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
      <div ref={containerRef} className="h-full w-full" data-testid="globe-watch-epidemics-map" />

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

/** Fetches the lazily-loaded Natural Earth boundary file (AC: 國界檔只在這
 * 個項目載入) and wires up the fill + outline layers, colored from `data`
 * at the moment the fetch resolves. */
function loadCountryBoundaries(map: MapLibreMap, data: EpidemicsGlobeData, onReady: () => void): void {
  fetch(EPIDEMIC_BOUNDARIES_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((geojson) => {
      if (map.getSource(COUNTRY_SOURCE_ID)) return;
      map.addSource(COUNTRY_SOURCE_ID, { type: "geojson", data: geojson });

      const firstSymbolLayerId = map.getStyle()?.layers?.find((l) => l.type === "symbol")?.id;

      map.addLayer(
        {
          id: COUNTRY_FILL_LAYER_ID,
          type: "fill",
          source: COUNTRY_SOURCE_ID,
          paint: {
            "fill-color": buildCountryFillColorExpression(
              data.countries,
              data.legend,
              EPIDEMIC_BOUNDARY_ISO_PROPERTY,
            ) as any,
            "fill-opacity": 0.65,
          },
        },
        firstSymbolLayerId,
      );
      map.addLayer(
        {
          id: COUNTRY_LINE_LAYER_ID,
          type: "line",
          source: COUNTRY_SOURCE_ID,
          paint: { "line-color": EPIDEMIC_BORDER_LINE_COLOR, "line-width": 0.6 },
        },
        firstSymbolLayerId,
      );
      onReady();
    })
    .catch((err) => {
      // Boundary fetch failing (offline, blocked, etc.) leaves the globe
      // showing only its basemap — the carried-over list below still has
      // every country/disease/level, so no information is lost (AC: 不支援
      // WebGL/地圖失敗時清單維持完整可用 — same resilience goal, different cause).
      console.warn("[GlobeWatchEpidemicsGlobe] failed to load country boundaries:", err);
    });
}

function addPointLayer(map: MapLibreMap, points: EpidemicPointFeature[]): void {
  if (map.getSource(POINT_SOURCE_ID)) return;
  map.addSource(POINT_SOURCE_ID, { type: "geojson", data: pointsToGeoJson(points) });
  map.addLayer({
    id: POINT_LAYER_ID,
    type: "circle",
    source: POINT_SOURCE_ID,
    paint: {
      "circle-radius": 6,
      "circle-color": [
        "match",
        ["get", "levelCode"],
        1,
        "#10b981",
        2,
        "#f59e0b",
        3,
        "#f43f5e",
        EPIDEMIC_NEUTRAL_FILL_COLOR,
      ] as any,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });
}

function updatePointSource(map: MapLibreMap, points: EpidemicPointFeature[]): void {
  const source = map.getSource(POINT_SOURCE_ID);
  if (source && "setData" in source) {
    (source as unknown as { setData: (data: unknown) => void }).setData(pointsToGeoJson(points));
  }
}

function pointsToGeoJson(points: EpidemicPointFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: points.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: { id: p.id, levelCode: p.levelCode, country: p.country },
    })),
  };
}

/** Issue #597 (parent #583) — adds the WHO DON pin source/layer once, at
 * map load, seeded with whatever `pins` the caller already filtered by the
 * "顯示 WHO 通報" toggle. A small circle marker (distinct violet color, AC
 * doesn't call for a custom icon asset) rather than reusing POINT_LAYER_ID's
 * styling — these are two independently-toggleable, independently-sourced
 * overlays that happen to both render as circles. */
function addWhoPinLayer(map: MapLibreMap, pins: WhoDonPinFeature[]): void {
  if (map.getSource(WHO_PIN_SOURCE_ID)) return;
  map.addSource(WHO_PIN_SOURCE_ID, { type: "geojson", data: whoPinsToGeoJson(pins) });
  map.addLayer({
    id: WHO_PIN_LAYER_ID,
    type: "circle",
    source: WHO_PIN_SOURCE_ID,
    paint: {
      "circle-radius": 5,
      "circle-color": WHO_PIN_COLOR,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": "#ffffff",
    },
  });
}

function updateWhoPinSource(map: MapLibreMap, pins: WhoDonPinFeature[]): void {
  const source = map.getSource(WHO_PIN_SOURCE_ID);
  if (source && "setData" in source) {
    (source as unknown as { setData: (data: unknown) => void }).setData(whoPinsToGeoJson(pins));
  }
}

function whoPinsToGeoJson(pins: WhoDonPinFeature[]) {
  return {
    type: "FeatureCollection" as const,
    features: pins.map((p) => ({
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
      properties: { id: p.id },
    })),
  };
}

function wireClickHandlers(
  map: MapLibreMap,
  onSelectCountryRef: { current: (iso: string | null) => void },
  onSelectWhoPinRef: { current: (id: string | null) => void },
): void {
  map.on("click", COUNTRY_FILL_LAYER_ID, (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    const feature = e.features?.[0];
    const iso = feature?.properties?.[EPIDEMIC_BOUNDARY_ISO_PROPERTY];
    if (typeof iso === "string" && iso) onSelectCountryRef.current(iso);
  });
  map.on("mouseenter", COUNTRY_FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", COUNTRY_FILL_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });

  map.on("click", WHO_PIN_LAYER_ID, (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
    const feature = e.features?.[0];
    const id = feature?.properties?.id;
    if (typeof id === "string" && id) onSelectWhoPinRef.current(id);
  });
  map.on("mouseenter", WHO_PIN_LAYER_ID, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", WHO_PIN_LAYER_ID, () => {
    map.getCanvas().style.cursor = "";
  });
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
  const firstSymbolLayerId = map.getStyle()?.layers?.find((layer) => layer.type === "symbol")?.id;
  map.addLayer(
    { id: SATELLITE_RASTER_LAYER_ID, type: "raster", source: SATELLITE_RASTER_SOURCE_ID, layout: { visibility: "visible" } },
    firstSymbolLayerId,
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
