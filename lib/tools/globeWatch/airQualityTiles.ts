// Relative import (not the `@/` alias) — same reasoning as this module's
// basemapStyles.ts sibling: keeps this file resolvable under a plain
// `node --test` import() with no path-alias loader hook registered.
import { appendOutboundUtm } from "../../format/outboundLink";

/**
 * Issue #598 (parent #583, phase 4 — 全球空品／global air quality). Pure
 * constants + a tiny pure builder function, no React/MapLibre/DOM
 * dependency, so the "token is always interpolated, never hard-coded"
 * contract is unit-testable without a browser (see
 * tests/global-watch-598-air-quality.test.mjs). The actual MapLibre raster
 * source wiring lives in GlobeWatchAirQualityGlobe.tsx, which only ever
 * calls `buildWaqiTileUrl` with the token the server-rendered page passed
 * down as a prop — this module itself never reads `process.env` (that's
 * lib/server/config/env.ts's job; see that file's `waqiToken` field for the
 * one place `WAQI_TOKEN` is actually read).
 *
 * WAQI's real-time AQI tile API (verified 2026-10-15 against
 * https://aqicn.org/faq/2015-09-18/map-web-service-real-time-air-quality-tile-api/):
 * a plain raster XYZ endpoint where `{aqi}` selects which pollutant/composite
 * is plotted — `usepa-aqi` is the composite AQI under the US EPA standard,
 * the value #583's spec calls for ("全球各地的即時 AQI 色塊"). Per #598's own
 * acceptance criteria, this is client-side only: the browser requests tiles
 * directly from WAQI with the token as a query parameter — no server round
 * trip, nothing stored in the DB — exactly like the OpenFreeMap/GIBS basemap
 * tiles in basemapStyles.ts are already requested directly from the browser.
 */

export const WAQI_AQI_LAYER = "usepa-aqi";

/**
 * Builds the tile URL template MapLibre's `raster` source `tiles` array
 * expects (the literal `{z}/{x}/{y}` placeholders are substituted by
 * MapLibre itself at request time — NOT interpolated here). `token` is
 * always a function parameter, never a module-level constant, so there is
 * no way for a real token value to end up committed in source (AC: 不寫死
 * 在原始碼).
 */
export function buildWaqiTileUrl(token: string): string {
  return `https://tiles.waqi.info/tiles/${WAQI_AQI_LAYER}/{z}/{x}/{y}.png?token=${encodeURIComponent(token)}`;
}

export const WAQI_RASTER_SOURCE_ID = "globe-watch-waqi-aqi";
export const WAQI_RASTER_LAYER_ID = "globe-watch-waqi-aqi-layer";

/** WAQI's native tile size — same 256px XYZ convention as basemapStyles.ts's GIBS tiles. */
export const WAQI_TILE_SIZE = 256;

/** WAQI tiles render best between roughly zoom 1 and zoom 10 (per the FAQ's own sample code); beyond that MapLibre just upscales the last level, which is fine for this overlay. */
export const WAQI_MAX_NATIVE_ZOOM = 10;

const WAQI_PROJECT_URL = appendOutboundUtm("https://waqi.info/", {
  medium: "map_attribution",
  campaign: "global_watch_air_quality",
});

/**
 * AC: 頁面顯示 WAQI 署名 — the project's own required attribution wording
 * ("Air Quality Tiles © waqi.info", per the FAQ above). Reused verbatim as
 * both the MapLibre AttributionControl string (GlobeWatchAirQualityGlobe.tsx)
 * and the in-page credit line (the air-quality page.tsx files), so the two
 * never drift apart.
 */
export const WAQI_ATTRIBUTION_HTML = `Air Quality Tiles &copy; <a href="${WAQI_PROJECT_URL}" target="_blank" rel="noopener noreferrer">waqi.info</a> (World Air Quality Index Project)`;

export interface AqiLegendEntry {
  /** US EPA AQI category, lower bound inclusive. */
  min: number;
  /** Upper bound inclusive, or `null` for the unbounded top band ("301+"). */
  max: number | null;
  color: string;
  labelZh: string;
}

/**
 * The 6-band US EPA AQI color scale. Deliberately kept as its own
 * self-contained literal table rather than importing
 * `lib/server/aqi/status.ts`'s `getAqiStatusAndColor` — no `lib/tools/**`
 * module in this repo imports from `lib/server/**` today (that boundary is
 * what keeps server-only code from accidentally reaching the client
 * bundle), and this module is imported by client components. The
 * breakpoints/labels/colors below are intentionally the exact same values
 * as `getAqiStatusAndColor` and the `/tools/aqi` catalog entry's own AQI
 * table (lib/server/tools/catalog.ts), so the two stay visually consistent;
 * the actual tile pixel colors are rendered by WAQI's own servers (not
 * controllable from here) — this legend is a reference scale, not a
 * reverse-engineering of WAQI's raster output.
 */
export const AQI_LEGEND: AqiLegendEntry[] = [
  { min: 0, max: 50, color: "#22c55e", labelZh: "良好" },
  { min: 51, max: 100, color: "#eab308", labelZh: "普通" },
  { min: 101, max: 150, color: "#f97316", labelZh: "對敏感族群不健康" },
  { min: 151, max: 200, color: "#ef4444", labelZh: "對所有族群不健康" },
  { min: 201, max: 300, color: "#8b5cf6", labelZh: "非常不健康" },
  { min: 301, max: null, color: "#7f1d1d", labelZh: "危害" },
];
