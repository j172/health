// Relative import (not the `@/` alias), same reasoning as
// components/Map/tileConfig.ts: keeps this module resolvable under a plain
// `node --test` import() with no path-alias loader hook registered (see
// tests/global-watch-587.test.mjs, which imports this module directly).
import { appendOutboundUtm } from "../../format/outboundLink";

/**
 * Issue #587 (parent #583): single source of truth for the globe's two
 * basemaps, following this repo's established convention (see
 * components/Map/tileConfig.ts's doc comment) of never hardcoding a tile/
 * style URL inside the component that renders it.
 *
 * - Vector (default): OpenFreeMap's hosted "Liberty" style — free, no API
 *   key, no usage cap (per #583's tech-selection decision; OpenFreeMap is
 *   the only vector basemap considered).
 * - Satellite (toggle): NASA GIBS' Blue Marble Next Generation layer — a
 *   static (non time-varying), public-domain imagery product, served as
 *   ordinary XYZ raster tiles over EPSG:3857.
 *
 * Neither requires an API key or account; WAQI (issue #583's only
 * credentialed source) is out of scope for this ticket (phase 4, #583 §
 * 分期).
 *
 * Attribution link UTM-tagged per issue #451 (see tileConfig.ts's own
 * FALLBACK_ATTRIBUTION for the sibling precedent) — these hrefs sit inside
 * MapLibre's own AttributionControl HTML string, not a React <a>, so they
 * can't go through the /out interstitial the way a normal in-app link does;
 * UTM tagging is the applicable half of issue #451 for a string rendered by
 * a third-party library's own control.
 */

const OPENFREEMAP_URL = appendOutboundUtm("https://www.openfreemap.org/", {
  medium: "map_attribution",
  campaign: "global_watch_basemap",
});
const OPENMAPTILES_URL = appendOutboundUtm("https://www.openmaptiles.org/", {
  medium: "map_attribution",
  campaign: "global_watch_basemap",
});
const OSM_COPYRIGHT_URL = appendOutboundUtm("https://www.openstreetmap.org/copyright", {
  medium: "map_attribution",
  campaign: "global_watch_basemap",
});
const GIBS_URL = appendOutboundUtm("https://www.earthdata.nasa.gov/data/tools/gibs", {
  medium: "map_attribution",
  campaign: "global_watch_basemap",
});

export const OPENFREEMAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

export const OPENFREEMAP_ATTRIBUTION_HTML =
  `&copy; <a href="${OPENFREEMAP_URL}" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> ` +
  `&copy; <a href="${OPENMAPTILES_URL}" target="_blank" rel="noopener noreferrer">OpenMapTiles</a> ` +
  `Data from <a href="${OSM_COPYRIGHT_URL}" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>`;

/**
 * GIBS REST/XYZ tile template for the static Blue Marble Next Generation
 * layer (no `{Time}` segment needed — unlike GIBS' time-varying satellite
 * products, this one is a fixed composite). See
 * https://nasa-gibs.github.io/gibs-api-docs/ for the general `.../wmts/
 * epsg3857/best/{layer}/default/{tileMatrixSet}/{z}/{y}/{x}.{ext}` pattern.
 */
export const GIBS_SATELLITE_TILE_URL =
  "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/EPSG3857_500m/{z}/{y}/{x}.jpeg";

export const GIBS_ATTRIBUTION_HTML = `Imagery courtesy NASA EOSDIS <a href="${GIBS_URL}" target="_blank" rel="noopener noreferrer">GIBS</a> / Blue Marble (public domain)`;

/** Blue Marble Next Generation's native EPSG3857_500m tile matrix set tops out around zoom 8; beyond that MapLibre just upscales the last level. */
export const GIBS_MAX_NATIVE_ZOOM = 8;

export const GIBS_TILE_SIZE = 256;

export const SATELLITE_RASTER_SOURCE_ID = "globe-watch-gibs-satellite";
export const SATELLITE_RASTER_LAYER_ID = "globe-watch-gibs-satellite-layer";
