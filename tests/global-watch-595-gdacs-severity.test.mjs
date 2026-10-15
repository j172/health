import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// Issue #595 (parent #583, blocked by #588/#592 — both merged): the GDACS EQ
// severity-color overlay on top of lib/tools/globeWatch/earthquakeGlobeFeatures.ts
// (issue #588's pure transform module). Same loader-hook convention as
// tests/global-watch-588-earthquakes.test.mjs (resolves "@/" imports and
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
  buildEarthquakeGlobeFeatureCollection,
  toEarthquakeGlobeFeature,
  matchGdacsEqEvent,
  GDACS_ALERT_LEVEL_COLORS,
  GDACS_EQ_MATCH_TIME_WINDOW_HOURS,
  GDACS_EQ_MATCH_DISTANCE_KM,
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

const baseGdacsEvent = (overrides = {}) => ({
  eventId: "1234567",
  alertLevel: "Orange",
  lat: 23.5,
  lng: 121.0,
  startTime: "2026-10-13T12:00:00Z",
  reportUrl: "https://www.gdacs.org/report/1234567",
  ...overrides,
});

// ---------------------------------------------------------------------------
// AC: "有對應事件時附加、沒有對應事件時維持原本規模配色"
// ---------------------------------------------------------------------------

test("toEarthquakeGlobeFeature attaches the GDACS color/level when a match is passed", () => {
  const row = baseRow({ magnitude: 6.0 });
  const match = baseGdacsEvent({ alertLevel: "Red" });
  const feature = toEarthquakeGlobeFeature(row, match);

  assert.equal(feature.properties.gdacsAlertLevel, "Red");
  assert.equal(feature.properties.gdacsColor, GDACS_ALERT_LEVEL_COLORS.Red);
  assert.equal(feature.properties.gdacsEventId, "1234567");
  assert.equal(feature.properties.gdacsReportUrl, "https://www.gdacs.org/report/1234567");
  // The magnitude-based color is still computed and present — the overlay
  // adds a field, it doesn't erase the original.
  assert.ok(feature.properties.markerColor);
});

test("toEarthquakeGlobeFeature keeps gdacsAlertLevel/gdacsColor null when no match is passed (original magnitude color untouched)", () => {
  const row = baseRow({ magnitude: 6.0 });
  const feature = toEarthquakeGlobeFeature(row, null);

  assert.equal(feature.properties.gdacsAlertLevel, null);
  assert.equal(feature.properties.gdacsColor, null);
  assert.equal(feature.properties.gdacsEventId, null);
  assert.equal(feature.properties.gdacsReportUrl, null);
  assert.ok(feature.properties.markerColor, "magnitude-based markerColor must still be set");
});

test("toEarthquakeGlobeFeature defaults gdacsMatch to null when the argument is omitted entirely", () => {
  const feature = toEarthquakeGlobeFeature(baseRow({ magnitude: 7.0 }));
  assert.equal(feature.properties.gdacsAlertLevel, null);
  assert.equal(feature.properties.gdacsColor, null);
});

// ---------------------------------------------------------------------------
// matchGdacsEqEvent — time/distance tolerance matching
// ---------------------------------------------------------------------------

test("matchGdacsEqEvent matches a GDACS EQ event at the same place and a close time", () => {
  const row = baseRow();
  const event = baseGdacsEvent();
  assert.deepEqual(matchGdacsEqEvent(row, [event]), event);
});

test("matchGdacsEqEvent returns null when no GDACS events are passed", () => {
  assert.equal(matchGdacsEqEvent(baseRow(), []), null);
});

test("matchGdacsEqEvent returns null when the only candidate is too far away", () => {
  // ~150km tolerance — this candidate sits roughly 300km+ east of the row.
  const row = baseRow({ lat: 23.5, lng: 121.0 });
  const farEvent = baseGdacsEvent({ lat: 23.5, lng: 124.5 });
  assert.equal(matchGdacsEqEvent(row, [farEvent]), null);
});

test("matchGdacsEqEvent returns null when the only candidate is outside the time tolerance", () => {
  const row = baseRow({ eventTime: "2026-10-13T12:00:00Z" });
  const lateEvent = baseGdacsEvent({
    startTime: new Date(
      new Date(row.eventTime).getTime() + (GDACS_EQ_MATCH_TIME_WINDOW_HOURS + 1) * 60 * 60 * 1000,
    ).toISOString(),
  });
  assert.equal(matchGdacsEqEvent(row, [lateEvent]), null);
});

test("matchGdacsEqEvent matches right at the edge of the time tolerance, excludes just past it", () => {
  const row = baseRow({ eventTime: "2026-10-13T12:00:00Z" });
  const rowMs = new Date(row.eventTime).getTime();
  const justInside = baseGdacsEvent({
    eventId: "inside",
    startTime: new Date(rowMs + GDACS_EQ_MATCH_TIME_WINDOW_HOURS * 60 * 60 * 1000 - 1000).toISOString(),
  });
  const justOutside = baseGdacsEvent({
    eventId: "outside",
    startTime: new Date(rowMs + GDACS_EQ_MATCH_TIME_WINDOW_HOURS * 60 * 60 * 1000 + 1000).toISOString(),
  });
  assert.equal(matchGdacsEqEvent(row, [justInside])?.eventId, "inside");
  assert.equal(matchGdacsEqEvent(row, [justOutside]), null);
});

test("matchGdacsEqEvent ignores a GDACS event with a null startTime", () => {
  const row = baseRow();
  const noTimeEvent = baseGdacsEvent({ startTime: null });
  assert.equal(matchGdacsEqEvent(row, [noTimeEvent]), null);
});

test("matchGdacsEqEvent picks the closest-in-time candidate when multiple are within tolerance", () => {
  const row = baseRow({ eventTime: "2026-10-13T12:00:00Z" });
  const rowMs = new Date(row.eventTime).getTime();
  const farther = baseGdacsEvent({ eventId: "farther", startTime: new Date(rowMs + 3 * 60 * 60 * 1000).toISOString() });
  const closer = baseGdacsEvent({ eventId: "closer", startTime: new Date(rowMs + 1 * 60 * 60 * 1000).toISOString() });
  assert.equal(matchGdacsEqEvent(row, [farther, closer])?.eventId, "closer");
});

test("GDACS_EQ_MATCH_DISTANCE_KM matches the documented tolerance (150km)", () => {
  assert.equal(GDACS_EQ_MATCH_DISTANCE_KM, 150);
});

// ---------------------------------------------------------------------------
// buildEarthquakeGlobeFeatureCollection — end-to-end overlay behavior
// ---------------------------------------------------------------------------

test("buildEarthquakeGlobeFeatureCollection attaches GDACS severity only to the earthquake that matches", () => {
  const rows = [
    baseRow({ id: "matched", magnitude: 6.0, lat: 23.5, lng: 121.0, eventTime: "2026-10-13T12:00:00Z" }),
    baseRow({ id: "unmatched", magnitude: 6.5, lat: -10.0, lng: -70.0, eventTime: "2026-10-13T12:00:00Z" }),
  ];
  const gdacsEvents = [baseGdacsEvent({ eventId: "gdacs-1", alertLevel: "Red", lat: 23.5, lng: 121.0, startTime: "2026-10-13T12:00:00Z" })];

  const collection = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW, gdacsEvents });

  const matched = collection.features.find((f) => f.properties.id === "matched");
  const unmatched = collection.features.find((f) => f.properties.id === "unmatched");

  assert.equal(matched.properties.gdacsAlertLevel, "Red");
  assert.equal(matched.properties.gdacsColor, GDACS_ALERT_LEVEL_COLORS.Red);

  // AC: "沒有對應事件的地震維持原本規模配色" — unmatched keeps gdacsColor null,
  // and its markerColor is exactly what resolveMagnitudeBucket would assign
  // with no GDACS involvement at all.
  assert.equal(unmatched.properties.gdacsAlertLevel, null);
  assert.equal(unmatched.properties.gdacsColor, null);
  assert.ok(unmatched.properties.markerColor);
});

test("buildEarthquakeGlobeFeatureCollection leaves every feature's gdacsAlertLevel/gdacsColor null when gdacsEvents is omitted", () => {
  const rows = [baseRow({ id: "a", magnitude: 6.0 }), baseRow({ id: "b", magnitude: 5.0 })];
  const collection = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW });
  for (const feature of collection.features) {
    assert.equal(feature.properties.gdacsAlertLevel, null);
    assert.equal(feature.properties.gdacsColor, null);
  }
});

// ---------------------------------------------------------------------------
// AC: "不影響既有的規模篩選（M4/M6/M7）與清單規則" — regression guard
// ---------------------------------------------------------------------------

test("passing gdacsEvents never changes which rows survive the globe threshold + M4/M6/M7 filter", () => {
  const eightDaysAgo = new Date(NOW.getTime() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const rows = [
    baseRow({ id: "global-m44", magnitude: 4.4, cwaSourced: false }), // excluded: below worldwide threshold
    baseRow({ id: "global-m45", magnitude: 4.5, cwaSourced: false }), // included
    baseRow({ id: "cwa-m40", magnitude: 4.0, cwaSourced: true }), // included
    baseRow({ id: "cwa-m39", magnitude: 3.9, cwaSourced: true }), // excluded: below CWA floor
    baseRow({ id: "stale-m70", magnitude: 7.0, cwaSourced: true, eventTime: eightDaysAgo }), // excluded: too old
  ];
  const gdacsEvents = [baseGdacsEvent({ lat: 23.5, lng: 121.0, startTime: "2026-10-13T12:00:00Z" })];

  const withoutGdacs = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW });
  const withGdacs = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW, gdacsEvents });

  const idsOf = (collection) => collection.features.map((f) => f.properties.id).sort();
  assert.deepEqual(idsOf(withGdacs), idsOf(withoutGdacs));
  assert.deepEqual(idsOf(withGdacs), ["cwa-m40", "global-m45"].sort());

  // Same check at the M6 UI tier, with GDACS data present — the filter tier
  // still only ever looks at magnitude.
  const atM6WithoutGdacs = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW, minMagnitude: 6.0 });
  const atM6WithGdacs = buildEarthquakeGlobeFeatureCollection(rows, { now: NOW, minMagnitude: 6.0, gdacsEvents });
  assert.deepEqual(idsOf(atM6WithGdacs), idsOf(atM6WithoutGdacs));
  assert.deepEqual(idsOf(atM6WithGdacs), []);
});
