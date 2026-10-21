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
import {
  EARTHQUAKE_FLY_DURATION_MS,
  EARTHQUAKE_FLY_ZOOM,
  DISASTER_FLY_DURATION_MS,
  DISASTER_FLY_ZOOM,
  RESET_VIEW_FLY_DURATION_MS,
  TAIWAN_DEFAULT_VIEW,
} from "@/lib/tools/globeWatch/defaultView";
import { resolveCameraTransition, resolveFlyDurationMs } from "@/lib/tools/globeWatch/motion";
import type {
  EarthquakeGlobeFeatureCollection,
  EarthquakeGlobeFeatureProperties,
} from "@/lib/tools/globeWatch/earthquakeGlobeFeatures";
import type {
  DisasterFeatureCollection,
  DisasterFeatureProperties,
} from "@/lib/tools/globeWatch/disastersTransform";
import { resolveDisasterTypeName, DISASTER_TYPE_NAMES } from "@/lib/tools/globeWatch/disasterTypeNames";
import { resolveAlertLevelName } from "@/lib/tools/globeWatch/disasterAlertLevelNames";
import { appendOutboundUtm } from "@/lib/format/outboundLink";
import { resolveCountryName as resolveDisasterCountryName } from "@/lib/tools/globeWatch/disasterCountryNames";

type BasemapMode = "vector" | "satellite";

const EARTHQUAKE_SOURCE_ID = "globe-watch-earthquakes";
const EARTHQUAKE_CIRCLE_LAYER_ID = "globe-watch-earthquakes-circle";
const EARTHQUAKE_TSUNAMI_LAYER_ID = "globe-watch-earthquakes-tsunami-ring";

const DISASTER_SOURCE_ID = "globe-watch-disasters";
const DISASTER_CIRCLE_LAYER_ID = "globe-watch-disasters-circle";
const DISASTER_SYMBOL_LAYER_ID = "globe-watch-disasters-symbol";

const EMPTY_EARTHQUAKE_COLLECTION: EarthquakeGlobeFeatureCollection = { type: "FeatureCollection", features: [] };
const EMPTY_DISASTER_COLLECTION: DisasterFeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Issue #588 (parent #583): the earthquake item's data layer — the first
 * data layer this globe shell (#587) ever gets. `GlobeWatchGlobe` itself
 * stays "dumb" per #583's decision ("地球元件只負責把 features 加到對應的
 * source／layer，不含任何業務邏輯"): every filtering/styling decision
 * (threshold, lookback, marker color/radius, tsunami flagging) already
 * happened in lib/tools/globeWatch/earthquakeGlobeFeatures.ts before this
 * FeatureCollection ever reaches here.
 */
export interface EarthquakeGlobeLayerProps {
  featureCollection: EarthquakeGlobeFeatureCollection;
  /** Set (and bump `flyToToken`, even to the same coordinates) to fly/jump
   * the camera to a single earthquake — e.g. clicking a list item. */
  flyTo?: { lng: number; lat: number; flyToToken: number } | null;
  /** Fired when a globe marker is clicked, in addition to this component's
   * own built-in popup. */
  onFeatureClick?: (properties: EarthquakeGlobeFeatureProperties) => void;
  /** Already-localized strings for the click popup (depth/tsunami/source-link
   * labels, and the "unnamed epicenter" fallback) — this component has no
   * i18n access of its own, same as every other label here. */
  popupLabels: {
    depthLabel: string;
    tsunamiLabel: string;
    sourceLinkLabel: string;
    unnamedPlaceholder: string;
    /** Issue #595 — optional so a caller that never fetches GDACS data
     * (none currently exist, but nothing here requires it) doesn't have to
     * pass a label it'll never use. `buildEarthquakePopupHtml` falls back
     * to a plain "GDACS:" when omitted. */
    gdacsAlertLabel?: string;
  };
}

/**
 * Issue #594 (parent #583): the disasters item's data layer — same "dumb
 * globe, business logic lives upstream" contract #588's earthquake layer
 * established. The one exception (same precedent as this file's own
 * `formatEventTimeForPopup`/earthquake popup, which already calls
 * Intl.DateTimeFormat directly rather than taking a pre-formatted string) is
 * that the popup builder below calls the disaster item's own
 * locale-aware-with-fallback name resolvers directly
 * (resolveDisasterTypeName/resolveAlertLevelName/resolveCountryName) —
 * these are deterministic lookups with a documented fallback, not a
 * filtering/scoring decision, so doing the lookup here (rather than
 * threading a giant pre-resolved-string bag through props) doesn't put any
 * real business logic in this "dumb" component.
 */
export interface DisasterGlobeLayerProps {
  featureCollection: DisasterFeatureCollection;
  flyTo?: { lng: number; lat: number; flyToToken: number } | null;
  onFeatureClick?: (properties: DisasterFeatureProperties) => void;
  /** Already-localized strings this component has no i18n access of its
   * own to produce. */
  popupLabels: {
    readOriginalLabel: string;
    unknownCountryLabel: string;
  };
}

const POPUP_INTL_LOCALE: Record<Locale, string> = {
  "zh-TW": "zh-TW",
  en: "en-US",
  ja: "ja-JP",
  ko: "ko-KR",
};

const formatEventTimeForPopup = (iso: string, locale: Locale): string => {
  try {
    return new Intl.DateTimeFormat(POPUP_INTL_LOCALE[locale] ?? "zh-TW", {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: "Asia/Taipei",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] ?? ch);

const buildEarthquakePopupHtml = (
  properties: EarthquakeGlobeFeatureProperties,
  locale: Locale,
  labels: EarthquakeGlobeLayerProps["popupLabels"],
): string => {
  const place = escapeHtml(properties.displayPlace ?? labels.unnamedPlaceholder);
  const timeText = escapeHtml(formatEventTimeForPopup(properties.eventTime, locale));
  const depthHtml =
    properties.depthKm != null
      ? `<div>${escapeHtml(labels.depthLabel)} ${properties.depthKm} km</div>`
      : "";
  const tsunamiHtml = properties.isTsunami
    ? `<div style="color:#dc2626;font-weight:700;margin-top:4px;">🌊 ${escapeHtml(labels.tsunamiLabel)}</div>`
    : "";
  // Issue #595 (AC: "點擊有警戒色的地震標記，彈出內容包含 GDACS 警戒等級") — only present
  // when earthquakeGlobeFeatures.ts's matchGdacsEqEvent found a GDACS EQ
  // event for this earthquake; an unmatched earthquake's popup is byte-for-
  // byte what #588 already rendered.
  const gdacsHtml = properties.gdacsAlertLevel
    ? `<div style="margin-top:4px;font-weight:600;color:${escapeHtml(properties.gdacsColor ?? "#374151")};">${escapeHtml(labels.gdacsAlertLabel ?? "GDACS:")} ${escapeHtml(properties.gdacsAlertLevel)}</div>`
    : "";
  const linkHtml = properties.url
    ? `<div style="margin-top:4px;"><a href="${escapeHtml(appendOutboundUtm(properties.url, { medium: "tool_outbound", campaign: "global_watch_earthquakes" }))}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;font-weight:600;">${escapeHtml(labels.sourceLinkLabel)}</a></div>`
    : "";

  return `<div style="font-size:12px;line-height:1.6;min-width:180px;">
    <div style="font-weight:700;">M${properties.magnitude.toFixed(1)} · ${place}</div>
    <div>${timeText}</div>
    ${depthHtml}
    ${tsunamiHtml}
    ${gdacsHtml}
    ${linkHtml}
  </div>`;
};

const buildDisasterPopupHtml = (
  properties: DisasterFeatureProperties,
  locale: Locale,
  labels: DisasterGlobeLayerProps["popupLabels"],
): string => {
  const emoji = DISASTER_TYPE_NAMES[properties.eventType]?.emoji ?? "⚠️";
  const typeLabel = escapeHtml(resolveDisasterTypeName(properties.eventType, locale));
  const alertLabel = escapeHtml(resolveAlertLevelName(properties.alertLevel, locale));
  const countryLabel = properties.countryIso
    ? escapeHtml(resolveDisasterCountryName(properties.countryIso, locale))
    : escapeHtml(labels.unknownCountryLabel);
  const titleHtml = escapeHtml(properties.title);
  const linkHtml = properties.reportUrl
    ? `<div style="margin-top:4px;"><a href="${escapeHtml(appendOutboundUtm(properties.reportUrl, { medium: "tool_outbound", campaign: "global_watch_disasters" }))}" target="_blank" rel="noopener noreferrer" style="color:#4f46e5;font-weight:600;">${escapeHtml(labels.readOriginalLabel)}</a></div>`
    : "";

  return `<div style="font-size:12px;line-height:1.6;min-width:200px;">
    <div style="font-weight:700;">${emoji} ${typeLabel} · ${countryLabel}</div>
    <div style="margin-top:2px;">
      <span aria-hidden="true" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escapeHtml(properties.markerColor)};margin-right:4px;"></span>
      ${alertLabel}
    </div>
    <div style="margin-top:4px;color:#475569;">${titleHtml}</div>
    ${linkHtml}
  </div>`;
};

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
  earthquakes,
  disasters,
}: {
  locale: Locale;
  reducedMotion: boolean;
  /** Issue #588: optional earthquake data layer — omitted entirely on the
   * bare `/tools/global-watch` globe shell (#587), which still renders
   * exactly as before. */
  earthquakes?: EarthquakeGlobeLayerProps;
  /** Issue #594: optional "全球災害" (disasters) data layer — omitted
   * entirely on every other item/the bare globe shell. */
  disasters?: DisasterGlobeLayerProps;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [basemapMode, setBasemapMode] = useState<BasemapMode>("vector");
  const [attributionHtml, setAttributionHtml] = useState(OPENFREEMAP_ATTRIBUTION_HTML);
  // Refs (not state) so the click handler bound once below always reads the
  // latest locale/reducedMotion/callback/labels without needing to be
  // re-bound on every change.
  const localeRef = useRef(locale);
  const reducedMotionRef = useRef(reducedMotion);
  const earthquakeLayerRef = useRef<EarthquakeGlobeLayerProps | undefined>(earthquakes);
  const disasterLayerRef = useRef<DisasterGlobeLayerProps | undefined>(disasters);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);
  useEffect(() => {
    earthquakeLayerRef.current = earthquakes;
  }, [earthquakes]);
  useEffect(() => {
    disasterLayerRef.current = disasters;
  }, [disasters]);

  // Mount once. Re-mounting on every `locale`/`reducedMotion` change would
  // flash a brand-new globe (and refetch the whole style) just to flip a
  // label field or an animation flag — both are instead applied to the
  // already-mounted map in the effects below.
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

    // OpenFreeMap's "liberty" style defaults to a flat mercator projection
    // (it has no opinion on globe vs. mercator) — `setProjection` is
    // MapLibre's own typed, runtime API for switching to the globe
    // projection (AC: 可拖曳旋轉、縮放，拉近時自然轉為平面地圖). This is a
    // genuine MapLibre GL JS feature, not something hand-rolled here.
    // `setProjection` throws "Style is not done loading" until the style is in, so it runs on `style.load`.
    map.on("style.load", () => map.setProjection({ type: "globe" }));

    map.addControl(new NavigationControl({ visualizePitch: false, showCompass: true }), "top-left");

    map.on("load", () => {
      applyLocaleLabels(map, locale);
      // Issue #588: the earthquake source/layers are created up front (even
      // with an empty FeatureCollection) and the click handler bound exactly
      // once here, rather than lazily in the data-sync effect below — a
      // layer-scoped `map.on("click", layerId, ...)` listener needs the
      // layer to already exist, and binding it unconditionally at `load`
      // means the later data-sync effect only ever needs to call
      // `source.setData(...)`, never re-bind anything.
      ensureEarthquakeLayers(map);
      map.on("click", EARTHQUAKE_CIRCLE_LAYER_ID, (e) => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.geometry.type !== "Point") return;
        const properties = feature.properties as unknown as EarthquakeGlobeFeatureProperties;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const layer = earthquakeLayerRef.current;
        if (layer) {
          new Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px" })
            .setLngLat([lng, lat])
            .setHTML(buildEarthquakePopupHtml(properties, localeRef.current, layer.popupLabels))
            .addTo(map);
          layer.onFeatureClick?.(properties);
        }
      });
      map.on("mouseenter", EARTHQUAKE_CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", EARTHQUAKE_CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });

      // Issue #594: same up-front source/layer + click-handler creation as
      // the earthquake layer above, for the 全球災害 (disasters) item.
      ensureDisasterLayers(map);
      map.on("click", DISASTER_CIRCLE_LAYER_ID, (e) => {
        const feature = e.features?.[0] as MapGeoJSONFeature | undefined;
        if (!feature || feature.geometry.type !== "Point") return;
        const properties = feature.properties as unknown as DisasterFeatureProperties;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        const layer = disasterLayerRef.current;
        if (layer) {
          new Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px" })
            .setLngLat([lng, lat])
            .setHTML(buildDisasterPopupHtml(properties, localeRef.current, layer.popupLabels))
            .addTo(map);
          layer.onFeatureClick?.(properties);
        }
      });
      map.on("mouseenter", DISASTER_CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", DISASTER_CIRCLE_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Issue #588: keeps the earthquake GeoJSON source in sync with the
  // caller's (already-filtered-by-M4/M6/M7) FeatureCollection. The
  // source/layers themselves were already created at `load` time above —
  // this effect only ever calls `setData`, so re-filtering (e.g. switching
  // the magnitude tier) never touches layer/paint definitions.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const data = earthquakes?.featureCollection ?? EMPTY_EARTHQUAKE_COLLECTION;
    const apply = () => {
      const source = map.getSource(EARTHQUAKE_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(data);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [earthquakes?.featureCollection]);

  // Issue #588 (AC: "點擊清單項目時地球飛到該地震的位置") — flies/jumps to a single
  // earthquake's coordinates whenever `flyToToken` changes (even to the same
  // point twice), respecting reduced motion exactly like the "回到台灣" reset
  // button below.
  useEffect(() => {
    const map = mapRef.current;
    const target = earthquakes?.flyTo;
    if (!map || !target) return;
    const view = { center: [target.lng, target.lat] as [number, number], zoom: Math.max(map.getZoom(), EARTHQUAKE_FLY_ZOOM) };
    if (resolveCameraTransition(reducedMotion) === "jump") {
      map.jumpTo(view);
    } else {
      map.flyTo({ ...view, duration: resolveFlyDurationMs(reducedMotion, EARTHQUAKE_FLY_DURATION_MS) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earthquakes?.flyTo?.flyToToken]);

  // Issue #594: keeps the disasters GeoJSON source in sync with the
  // caller's (already-filtered-by-checkbox) FeatureCollection — same
  // setData-only convention as the earthquake layer above.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const data = disasters?.featureCollection ?? EMPTY_DISASTER_COLLECTION;
    const apply = () => {
      const source = map.getSource(DISASTER_SOURCE_ID) as GeoJSONSource | undefined;
      source?.setData(data);
    };
    if (map.isStyleLoaded()) apply();
    else map.once("load", apply);
  }, [disasters?.featureCollection]);

  // Issue #594: flies/jumps to a single disaster event's coordinates
  // whenever `flyToToken` changes — same pattern as the earthquake layer's
  // own list→globe "fly to" effect above.
  useEffect(() => {
    const map = mapRef.current;
    const target = disasters?.flyTo;
    if (!map || !target) return;
    const view = { center: [target.lng, target.lat] as [number, number], zoom: Math.max(map.getZoom(), DISASTER_FLY_ZOOM) };
    if (resolveCameraTransition(reducedMotion) === "jump") {
      map.jumpTo(view);
    } else {
      map.flyTo({ ...view, duration: resolveFlyDurationMs(reducedMotion, DISASTER_FLY_DURATION_MS) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disasters?.flyTo?.flyToToken]);

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

/**
 * Adds the GIBS satellite raster source/layer if it isn't already on the
 * map. Inserted just below the earthquake marker layers when those exist
 * (issue #588 — otherwise an opaque satellite raster added *after* the
 * earthquake layers would render on top of them, hiding every marker), or
 * below the first label layer otherwise, so place names still draw on top
 * of the imagery either way.
 */
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
  // Issue #594: the disasters symbol layer is also a marker layer the
  // satellite raster must stay beneath — same reasoning as the earthquake
  // tsunami-ring check this already had.
  const beforeId = map.getLayer(EARTHQUAKE_TSUNAMI_LAYER_ID)
    ? EARTHQUAKE_TSUNAMI_LAYER_ID
    : map.getLayer(DISASTER_CIRCLE_LAYER_ID)
      ? DISASTER_CIRCLE_LAYER_ID
      : firstSymbolLayerId;

  map.addLayer(
    {
      id: SATELLITE_RASTER_LAYER_ID,
      type: "raster",
      source: SATELLITE_RASTER_SOURCE_ID,
      layout: { visibility: "visible" },
    },
    beforeId,
  );
}

/**
 * Issue #588: creates the earthquake GeoJSON source + its two circle layers
 * (idempotent — a no-op if already created). The tsunami "ring" layer is
 * added first (so it stacks underneath) and only draws for
 * `isTsunami: true` features (AC: "有海嘯警報的地震加上明顯標記"); the base
 * circle layer scales radius/color straight from the feature properties
 * `lib/tools/globeWatch/earthquakeGlobeFeatures.ts` already computed (AC:
 * "標記大小/顏色依規模分級") — no business logic lives here, only wiring.
 */
function ensureEarthquakeLayers(map: MapLibreMap): void {
  if (map.getSource(EARTHQUAKE_SOURCE_ID)) return;

  map.addSource(EARTHQUAKE_SOURCE_ID, { type: "geojson", data: EMPTY_EARTHQUAKE_COLLECTION });

  const firstSymbolLayerId = map
    .getStyle()
    ?.layers?.find((layer) => layer.type === "symbol")?.id;

  map.addLayer(
    {
      id: EARTHQUAKE_TSUNAMI_LAYER_ID,
      type: "circle",
      source: EARTHQUAKE_SOURCE_ID,
      filter: ["==", ["get", "isTsunami"], true],
      paint: {
        "circle-radius": ["+", ["get", "markerRadiusPx"], 6],
        "circle-color": "rgba(220, 38, 38, 0.08)",
        "circle-stroke-color": "#dc2626",
        "circle-stroke-width": 2.5,
      },
    },
    firstSymbolLayerId,
  );

  map.addLayer(
    {
      id: EARTHQUAKE_CIRCLE_LAYER_ID,
      type: "circle",
      source: EARTHQUAKE_SOURCE_ID,
      paint: {
        "circle-radius": ["get", "markerRadiusPx"],
        // Issue #595: `coalesce` picks the first non-null value, so a
        // feature with a GDACS match (`gdacsColor` set by
        // earthquakeGlobeFeatures.ts's toEarthquakeGlobeFeature) renders in
        // its GDACS red/orange/green, and every other feature falls
        // through to the original magnitude-based `markerColor` exactly as
        // #588 painted it (AC: "沒有對應事件的地震維持原本規模配色").
        "circle-color": ["coalesce", ["get", "gdacsColor"], ["get", "markerColor"]],
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1,
      },
    },
    firstSymbolLayerId,
  );
}

/**
 * Issue #594: creates the disasters GeoJSON source + its two layers
 * (idempotent). A circle layer painted by `markerColor` (the alert-level
 * color `lib/tools/globeWatch/disastersTransform.ts` already resolved — AC:
 * "依 GDACS 紅/橙/綠警戒等級上色"), plus a symbol layer on top showing each
 * event's disaster-type emoji so FL/VO/DR/WF stay visually distinguishable
 * even when several share the same alert color. No business logic lives
 * here, only wiring — same contract as ensureEarthquakeLayers above.
 */
function ensureDisasterLayers(map: MapLibreMap): void {
  if (map.getSource(DISASTER_SOURCE_ID)) return;

  map.addSource(DISASTER_SOURCE_ID, { type: "geojson", data: EMPTY_DISASTER_COLLECTION });

  const firstSymbolLayerId = map
    .getStyle()
    ?.layers?.find((layer) => layer.type === "symbol")?.id;

  map.addLayer(
    {
      id: DISASTER_CIRCLE_LAYER_ID,
      type: "circle",
      source: DISASTER_SOURCE_ID,
      paint: {
        "circle-radius": 9,
        "circle-color": ["get", "markerColor"],
        "circle-opacity": 0.85,
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 1.5,
      },
    },
    firstSymbolLayerId,
  );

  map.addLayer(
    {
      id: DISASTER_SYMBOL_LAYER_ID,
      type: "symbol",
      source: DISASTER_SOURCE_ID,
      layout: {
        "text-field": [
          "match",
          ["get", "eventType"],
          "FL",
          DISASTER_TYPE_NAMES.FL.emoji,
          "VO",
          DISASTER_TYPE_NAMES.VO.emoji,
          "DR",
          DISASTER_TYPE_NAMES.DR.emoji,
          "WF",
          DISASTER_TYPE_NAMES.WF.emoji,
          "⚠️",
        ],
        "text-size": 11,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: { "text-color": "#ffffff" },
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
    // Issue #594: this item's own disaster-type-emoji symbol layer has a
    // `text-field` too, but it must never be overwritten by the basemap's
    // place-name label expression below — it isn't a basemap label at all.
    if (layer.id === DISASTER_SYMBOL_LAYER_ID) continue;
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
