import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #588 (parent #583): the earthquake item's "項目 → 地球資料" pure-logic
// seam — lib/tools/globeWatch/earthquakeGlobeFeatures.ts. Same loader-hook
// convention as tests/global-watch-587.test.mjs (resolves "@/" imports and
// bare-extension relative imports to their .ts source).
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

const {
  isGlobeEarthquake,
  isWithinGlobeLookback,
  buildEarthquakeGlobeFeatureCollection,
  toEarthquakeGlobeFeature,
  resolveMagnitudeBucket,
  GLOBE_EARTHQUAKE_LOOKBACK_HOURS,
  GLOBE_MIN_MAGNITUDE_WORLDWIDE,
  GLOBE_MIN_MAGNITUDE_CWA,
  EARTHQUAKE_MAGNITUDE_BUCKETS,
  EARTHQUAKE_GLOBE_LEGEND,
} = await import("../lib/tools/globeWatch/earthquakeGlobeFeatures.ts");

const NOW = new Date("2026-10-14T00:00:00Z");

const baseRow = (overrides = {}) => ({
  id: 1,
  eventTime: "2026-10-13T12:00:00Z",
  magnitude: 4.5,
  depthKm: 10,
  lat: 23.5,
  lng: 121.0,
  place: "Hualien, Taiwan",
  placeZh: "花蓮縣",
  tsunamiWarning: false,
  primarySource: "cwa",
  url: "https://example.com/report",
  cwaSourced: false,
  ...overrides,
});

// ---------------------------------------------------------------------------
// AC: "全球 M4.4 事件不上地球、M4.5 會上"
// ---------------------------------------------------------------------------

test("isGlobeEarthquake excludes a global M4.4 event (below the worldwide 4.5 threshold, not CWA-sourced)", () => {
  const row = baseRow({ magnitude: 4.4, cwaSourced: false });
  assert.equal(isGlobeEarthquake(row, NOW), false);
});

test("isGlobeEarthquake includes a global M4.5 event", () => {
  const row = baseRow({ magnitude: 4.5, cwaSourced: false });
  assert.equal(isGlobeEarthquake(row, NOW), true);
});

test("isGlobeEarthquake includes a global M6.0 event (well above both thresholds)", () => {
  const row = baseRow({ magnitude: 6.0, cwaSourced: false });
  assert.equal(isGlobeEarthquake(row, NOW), true);
});

// ---------------------------------------------------------------------------
// AC: "台灣 CWA M4.0 會上"
// ---------------------------------------------------------------------------

test("isGlobeEarthquake includes a Taiwan/CWA-sourced M4.0 event", () => {
  const row = baseRow({ magnitude: 4.0, cwaSourced: true });
  assert.equal(isGlobeEarthquake(row, NOW), true);
});

test("isGlobeEarthquake excludes a CWA-sourced M3.9 event (below the CWA 4.0 floor)", () => {
  const row = baseRow({ magnitude: 3.9, cwaSourced: true });
  assert.equal(isGlobeEarthquake(row, NOW), false);
});

test("isGlobeEarthquake excludes a non-CWA M4.0 event (below the worldwide 4.5 threshold and not CWA-sourced)", () => {
  const row = baseRow({ magnitude: 4.0, cwaSourced: false });
  assert.equal(isGlobeEarthquake(row, NOW), false);
});

// ---------------------------------------------------------------------------
// AC: "超過 7 天的不上"
// ---------------------------------------------------------------------------

test("isWithinGlobeLookback / isGlobeEarthquake exclude an event older than 7 days", () => {
  const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinGlobeLookback(eightDaysAgo, NOW), false);

  const row = baseRow({ magnitude: 7.0, eventTime: eightDaysAgo, cwaSourced: true });
  assert.equal(isGlobeEarthquake(row, NOW), false);
});

test("isWithinGlobeLookback includes an event just under 7 days old, excludes one just over", () => {
  const justUnder = new Date(NOW.getTime() - (GLOBE_EARTHQUAKE_LOOKBACK_HOURS * 60 * 60 * 1000 - 1000)).toISOString();
  const justOver = new Date(NOW.getTime() - (GLOBE_EARTHQUAKE_LOOKBACK_HOURS * 60 * 60 * 1000 + 1000)).toISOString();
  assert.equal(isWithinGlobeLookback(justUnder, NOW), true);
  assert.equal(isWithinGlobeLookback(justOver, NOW), false);
});

test("isWithinGlobeLookback excludes a future-dated event (negative age)", () => {
  const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
  assert.equal(isWithinGlobeLookback(future, NOW), false);
});

// ---------------------------------------------------------------------------
// AC: "有海嘯旗標的加上標記"
// ---------------------------------------------------------------------------

test("toEarthquakeGlobeFeature flags a tsunami-warning event distinctly (isTsunami: true)", () => {
  const feature = toEarthquakeGlobeFeature(baseRow({ tsunamiWarning: true }));
  assert.equal(feature.properties.isTsunami, true);
});

test("toEarthquakeGlobeFeature does not flag a non-tsunami event", () => {
  const feature = toEarthquakeGlobeFeature(baseRow({ tsunamiWarning: false }));
  assert.equal(feature.properties.isTsunami, false);
});

// ---------------------------------------------------------------------------
// Marker size/color scaling by magnitude
// ---------------------------------------------------------------------------

test("resolveMagnitudeBucket scales marker color/radius strictly with magnitude", () => {
  const m4 = resolveMagnitudeBucket(4.2);
  const m5 = resolveMagnitudeBucket(5.2);
  const m6 = resolveMagnitudeBucket(6.2);
  const m7 = resolveMagnitudeBucket(7.2);
  assert.ok(m4.radiusPx < m5.radiusPx, "M5 marker should be larger than M4");
  assert.ok(m5.radiusPx < m6.radiusPx, "M6 marker should be larger than M5");
  assert.ok(m6.radiusPx < m7.radiusPx, "M7 marker should be larger than M6");
  assert.notEqual(m4.color, m7.color, "M4 and M7 should use visually distinct colors");
});

test("toEarthquakeGlobeFeature carries the resolved marker color/radius onto GeoJSON properties", () => {
  const feature = toEarthquakeGlobeFeature(baseRow({ magnitude: 7.3 }));
  const bucket = resolveMagnitudeBucket(7.3);
  assert.equal(feature.properties.markerColor, bucket.color);
  assert.equal(feature.properties.markerRadiusPx, bucket.radiusPx);
});

test("EARTHQUAKE_GLOBE_LEGEND is the same ladder used for marker styling (no drift between legend and markers)", () => {
  assert.equal(EARTHQUAKE_GLOBE_LEGEND, EARTHQUAKE_MAGNITUDE_BUCKETS);
  assert.ok(EARTHQUAKE_GLOBE_LEGEND.length >= 4);
});

// ---------------------------------------------------------------------------
// Chinese-place-name preference (AC: "優先顯示中文地名")
// ---------------------------------------------------------------------------

test("toEarthquakeGlobeFeature prefers the Chinese place name when present", () => {
  const feature = toEarthquakeGlobeFeature(baseRow({ place: "Hualien, Taiwan", placeZh: "花蓮縣" }));
  assert.equal(feature.properties.displayPlace, "花蓮縣");
});

test("toEarthquakeGlobeFeature falls back to the raw place when no Chinese name exists", () => {
  const feature = toEarthquakeGlobeFeature(baseRow({ place: "Off the coast of Chile", placeZh: null }));
  assert.equal(feature.properties.displayPlace, "Off the coast of Chile");
});

// ---------------------------------------------------------------------------
// buildEarthquakeGlobeFeatureCollection — end-to-end + the shared M4/M6/M7 filter
// ---------------------------------------------------------------------------

test("buildEarthquakeGlobeFeatureCollection combines the threshold rule, the lookback window, and tsunami flagging into one FeatureCollection", () => {
  const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [
    baseRow({ id: "global-m44", magnitude: 4.4, cwaSourced: false }), // excluded: below worldwide threshold
    baseRow({ id: "global-m45", magnitude: 4.5, cwaSourced: false }), // included
    baseRow({ id: "cwa-m40", magnitude: 4.0, cwaSourced: true }), // included
    baseRow({ id: "cwa-m39", magnitude: 3.9, cwaSourced: true }), // excluded: below CWA floor
    baseRow({ id: "stale-m70", magnitude: 7.0, cwaSourced: true, eventTime: eightDaysAgo }), // excluded: too old
    baseRow({ id: "tsunami-m71", magnitude: 7.1, cwaSourced: false, tsunamiWarning: true }), // included + tsunami
  ];

  const collection = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW });
  assert.equal(collection.type, "FeatureCollection");
  const ids = collection.features.map((f) => f.properties.id).sort();
  assert.deepEqual(ids, ["cwa-m40", "global-m45", "tsunami-m71"].sort());

  const tsunamiFeature = collection.features.find((f) => f.properties.id === "tsunami-m71");
  assert.equal(tsunamiFeature.properties.isTsunami, true);
});

test("buildEarthquakeGlobeFeatureCollection applies the shared M4/M6/M7 UI filter on top of the globe's own threshold (AC: 篩選同時套用在地球與清單)", () => {
  const rows = [
    baseRow({ id: "cwa-m40", magnitude: 4.0, cwaSourced: true }),
    baseRow({ id: "global-m60", magnitude: 6.0, cwaSourced: false }),
    baseRow({ id: "global-m71", magnitude: 7.1, cwaSourced: false }),
  ];

  const atM4 = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW, minMagnitude: 4.0 });
  assert.equal(atM4.features.length, 3);

  const atM6 = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW, minMagnitude: 6.0 });
  assert.deepEqual(atM6.features.map((f) => f.properties.id).sort(), ["global-m60", "global-m71"].sort());

  const atM7 = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW, minMagnitude: 7.0 });
  assert.deepEqual(atM7.features.map((f) => f.properties.id), ["global-m71"]);
});

test("buildEarthquakeGlobeFeatureCollection returns an empty FeatureCollection for no rows, never throws", () => {
  const collection = buildEarthquakeGlobeFeatureCollection([], { now: NOW });
  assert.deepEqual(collection, { type: "FeatureCollection", features: [] });
});

// ---------------------------------------------------------------------------
// Threshold constants — regression guards
// ---------------------------------------------------------------------------

test("globe threshold constants match issue #588's documented rule (worldwide 4.5+, CWA 4.0+, 7-day lookback)", () => {
  assert.equal(GLOBE_MIN_MAGNITUDE_WORLDWIDE, 4.5);
  assert.equal(GLOBE_MIN_MAGNITUDE_CWA, 4.0);
  assert.equal(GLOBE_EARTHQUAKE_LOOKBACK_HOURS, 24 * 7);
});
