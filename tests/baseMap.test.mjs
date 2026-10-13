import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// tileConfig.ts (imported below) now pulls in lib/format/outboundLink via a
// relative, extension-less specifier (issue #451), which itself uses the
// `@/` alias — plain `node --test` can't resolve either without a loader
// hook, same as tests/outboundLinkUtm.test.mjs.
const REPO_ROOT = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

// components/Map/BaseMap.tsx is a React/JSX client component that mounts a real
// Leaflet map; this repo's test runner has no JSX/DOM rendering harness wired up
// (see tests/SidebarWidgetShell.test.mjs and tests/useSidebarWidgetData.test.mjs
// for the same caveat with other Leaflet/UI components). The pure-logic pieces
// (clusterMarkers, tileConfig) get real unit tests below; the component itself
// is verified via source inspection against the issue #475 acceptance criteria,
// following the established convention in this repo.

const baseMapPath = path.join(process.cwd(), "components/Map/BaseMap.tsx");
const baseMapSrc = fs.readFileSync(baseMapPath, "utf-8");

test("BaseMap supports passing in markers with popup content (AC: 標記點位與彈出視窗內容)", () => {
  assert.ok(/markers:\s*BaseMapMarker\[\]/.test(baseMapSrc), "markers prop should be an array of BaseMapMarker");
  assert.ok(/popup\?:\s*ReactNode/.test(baseMapSrc), "BaseMapMarker should accept arbitrary popup content");
  assert.ok(/<Popup>\{marker\.popup\}<\/Popup>/.test(baseMapSrc), "individual markers should render their popup content");
});

test("BaseMap always mounts the OSM fallback tile layer underneath the primary layer, so the map is never blank", () => {
  const fallbackIdx = baseMapSrc.indexOf("FALLBACK_TILE_Z_INDEX");
  const primaryIdx = baseMapSrc.indexOf("PRIMARY_TILE_Z_INDEX", fallbackIdx);
  assert.ok(fallbackIdx > -1 && primaryIdx > fallbackIdx, "fallback TileLayer must be declared (and thus mounted) before the primary TileLayer");

  // The fallback layer must not be conditionally rendered — it's always present as the safety net.
  const fallbackLine = baseMapSrc.slice(fallbackIdx - 200, fallbackIdx + 50);
  assert.ok(!/primaryTileFailed\s*&&[\s\S]{0,80}FALLBACK_TILE_Z_INDEX/.test(fallbackLine), "fallback layer should not be gated behind the failure flag");
});

test("BaseMap switches away from the primary basemap after repeated tile errors, not a single blip", () => {
  assert.ok(baseMapSrc.includes("PRIMARY_TILE_ERROR_THRESHOLD"), "should use a shared error threshold constant instead of a magic number");
  assert.ok(/tileerror:\s*\(\)\s*=>\s*{/.test(baseMapSrc), "should listen to the tileerror event on the primary TileLayer");
  assert.ok(/primaryErrorCount\.current\s*>=\s*PRIMARY_TILE_ERROR_THRESHOLD/.test(baseMapSrc), "should only flip to the fallback after crossing the threshold");
  assert.ok(/tileload:\s*\(\)\s*=>\s*{\s*primaryErrorCount\.current\s*=\s*0;/.test(baseMapSrc), "a successful tile load should reset the error count (avoid false positives from sporadic errors)");
  assert.ok(/opacity=\{primaryTileFailed \? 0 : 1\}/.test(baseMapSrc), "primary layer should hide itself (not unmount) on failure, revealing the already-mounted fallback instantly");
});

test("BaseMap shows attribution for both the primary (NLSC) and fallback (OSM) basemaps", () => {
  assert.ok(baseMapSrc.includes("PRIMARY_ATTRIBUTION"), "primary TileLayer should carry its attribution prop");
  assert.ok(baseMapSrc.includes("FALLBACK_ATTRIBUTION"), "fallback TileLayer should carry its attribution prop");
});

test("BaseMap has a built-in locate button gated on userLocation.refresh being provided", () => {
  assert.ok(/userLocation\?\.refresh\s*&&/.test(baseMapSrc), "locate button should only render when a refresh callback is given");
  assert.ok(baseMapSrc.includes("🎯"), "locate button should use the same target icon convention as the existing 9 map components");
});

test("BaseMap supports an optional scrollWheelZoom prop, defaulting to true (issue #476: WaterOutagesLeaflet relies on being able to opt out, since its map is embedded in a scrollable list)", () => {
  assert.ok(/scrollWheelZoom\?:\s*boolean/.test(baseMapSrc), "BaseMapProps should declare an optional scrollWheelZoom prop");
  assert.ok(/scrollWheelZoom\s*=\s*true/.test(baseMapSrc), "scrollWheelZoom should default to true, preserving the other 8 maps' pre-migration behavior");
  assert.ok(/<MapContainer[^>]*scrollWheelZoom=\{scrollWheelZoom\}/.test(baseMapSrc), "the prop must actually reach the underlying MapContainer, not just be declared");
});

test("WaterOutagesLeaflet.tsx passes scrollWheelZoom={false} to BaseMap (issue #327's original setting, preserved across the issue #476 migration)", () => {
  const src = fs.readFileSync(path.join(process.cwd(), "components/WaterOutages/WaterOutagesLeaflet.tsx"), "utf-8");
  assert.ok(/<BaseMap[\s\S]{0,400}scrollWheelZoom=\{false\}/.test(src), "WaterOutagesLeaflet must opt out of scroll-wheel zoom, matching its pre-migration MapContainer setting");
});

test("BaseMap has built-in marker clustering wired to the current zoom level", () => {
  assert.ok(baseMapSrc.includes("import { clusterMarkers } from \"@/components/Map/clusterMarkers\""), "should delegate clustering to the pure clusterMarkers function");
  assert.ok(baseMapSrc.includes("useMapEvents"), "should re-cluster when the user zooms (not just on initial render)");
  assert.ok(/zoomend:\s*\(\)\s*=>\s*setZoom\(map\.getZoom\(\)\)/.test(baseMapSrc), "should track zoom changes via the zoomend event");
});

test("BaseMap has a built-in list/map view toggle", () => {
  assert.ok(/viewMode,?\s*setViewMode\]\s*=\s*useState<"map"\s*\|\s*"list">/.test(baseMapSrc), "should track a map/list view mode");
  assert.ok(baseMapSrc.includes('setViewMode("map")'), "toggle should be able to switch to map view");
  assert.ok(baseMapSrc.includes('setViewMode("list")'), "toggle should be able to switch to list view");
});

test("BaseMap reuses the existing shared MapViewController and userLocationIcon rather than reimplementing flyTo", () => {
  assert.ok(baseMapSrc.includes('import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController"'), "should import the existing shared flyTo controller and user-location icon");
  assert.ok(/<MapViewController center=\{mapCenter\} zoom=\{mapZoom\}\s*\/>/.test(baseMapSrc), "should mount MapViewController so centering/flyTo keeps working the same way as the other 9 maps");
});

test("BaseMap is marked SSR-unsafe and documents dynamic(..., { ssr: false }) usage like the other 9 map components", () => {
  assert.ok(baseMapSrc.includes('"use client"'), "must be a client component");
  assert.ok(/ssr:\s*false/.test(baseMapSrc), "doc comment should show the required dynamic-import usage");
});

test("BaseMap does not hardcode any tile URLs itself — they only live in tileConfig.ts (source-inspection seam ②, see docs/2.0/spec-issue-438.md)", () => {
  assert.ok(!baseMapSrc.includes("tile.openstreetmap.org"), "BaseMap.tsx itself must not hardcode the OSM URL");
  assert.ok(!baseMapSrc.includes("wmts.nlsc.gov.tw"), "BaseMap.tsx itself must not hardcode the NLSC URL");
});

const tileConfigPath = path.join(process.cwd(), "components/Map/tileConfig.ts");
const tileConfigSrc = fs.readFileSync(tileConfigPath, "utf-8");

test("tileConfig defines the NLSC EMAP open-data layer as primary and OSM (without the {s} subdomain) as fallback", async () => {
  assert.ok(tileConfigSrc.includes("wmts.nlsc.gov.tw"), "primary basemap should be the NLSC WMTS service");
  assert.ok(/PRIMARY_TILE_URL\s*=\s*"https:\/\/wmts\.nlsc\.gov\.tw\//.test(tileConfigSrc));

  const { FALLBACK_TILE_URL } = await import("../components/Map/tileConfig.ts");
  assert.ok(FALLBACK_TILE_URL.startsWith("https://tile.openstreetmap.org/"), "fallback must use the single non-{s} OSM hostname per the OSMF tile usage policy, unlike the existing 9 map components");
  assert.ok(!FALLBACK_TILE_URL.includes("{s}"), "fallback URL must not use the {s} subdomain pattern the OSMF policy warns against");
});

test("tileConfig attributions credit both NLSC and OpenStreetMap", async () => {
  const { PRIMARY_ATTRIBUTION, FALLBACK_ATTRIBUTION } = await import("../components/Map/tileConfig.ts");
  assert.ok(PRIMARY_ATTRIBUTION.includes("國土測繪中心"));
  assert.ok(FALLBACK_ATTRIBUTION.includes("OpenStreetMap"));
});
