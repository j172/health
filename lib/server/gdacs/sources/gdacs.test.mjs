// Parser tests for the GDACS event-list / track-geometry payloads, against
// a real fixture captured live from gdacs.org on 2026-10-14 (see
// ../__fixtures__/README below each fixture's own first line of context in
// the PR description) — same loader-hook + fixture approach as
// lib/server/antiFraud/sources/police176455.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
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

const { parseGdacsEventFeature, parseGdacsEventList, extractTcTrack } = await import("./gdacs.ts");

const readFixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../__fixtures__/${name}`, import.meta.url)), "utf-8"));

const eventListFixture = readFixture("gdacs-eventlist-sample.json");
const tcTrackFixture = readFixture("gdacs-tc-track-sample.json");

test("parseGdacsEventList: parses the live fixture into one row per event type", () => {
  const rows = parseGdacsEventList(eventListFixture);
  assert.equal(rows.length, 6);

  const byType = Object.fromEntries(rows.map((r) => [r.eventType, r]));
  assert.ok(byType.TC, "expected a TC row");
  assert.ok(byType.EQ, "expected an EQ row");
  assert.ok(byType.FL, "expected an FL row");
  assert.ok(byType.VO, "expected a VO row");
  assert.ok(byType.DR, "expected a DR row");
  assert.ok(byType.WF, "expected a WF row");

  // TC row (TRUDY-26, Mexico) — spot-check every field the issue requires.
  const tc = byType.TC;
  assert.equal(tc.eventId, "1001337");
  assert.equal(tc.episodeId, "3");
  assert.equal(tc.alertLevel, "Red");
  assert.equal(tc.countryIso, "MEX");
  assert.ok(Math.abs(tc.lat - 11.2) < 0.01);
  assert.ok(Math.abs(tc.lng - -97.0) < 0.01);
  assert.equal(tc.startTime, "2026-10-13 15:00:00");
  assert.equal(tc.endTime, "2026-10-14 03:00:00");
  assert.equal(tc.title, "Tropical Cyclone TRUDY-26");
  assert.ok(tc.reportUrl.includes("report.aspx"));
  // Fetching TC basin/track is fetchGdacsEvents()'s job (needs a second HTTP
  // call per event), not the list parser's — both are null straight out of
  // parseGdacsEventFeature.
  assert.equal(tc.basin, null);
  assert.equal(tc.trackGeoJson, null);
});

test("parseGdacsEventList: EQ row carries the Panama earthquake's fields", () => {
  const rows = parseGdacsEventList(eventListFixture);
  const eq = rows.find((r) => r.eventType === "EQ");
  assert.equal(eq.countryIso, "PAN");
  assert.equal(eq.alertLevel, "Orange");
  assert.equal(eq.title, "Earthquake in Panama");
});

test("parseGdacsEventFeature: drops a feature with an unrecognized eventtype", () => {
  const row = parseGdacsEventFeature({
    properties: { eventtype: "XX", eventid: "999", name: "Mystery event" },
    geometry: { type: "Point", coordinates: [10, 20] },
  });
  assert.equal(row, null);
});

test("parseGdacsEventFeature: drops a feature with no eventid", () => {
  const row = parseGdacsEventFeature({
    properties: { eventtype: "EQ", name: "No id" },
    geometry: { type: "Point", coordinates: [10, 20] },
  });
  assert.equal(row, null);
});

test("parseGdacsEventFeature: drops a feature with neither Point geometry nor a usable bbox", () => {
  const row = parseGdacsEventFeature({
    properties: { eventtype: "FL", eventid: "123", name: "Nowhere" },
    geometry: null,
  });
  assert.equal(row, null);
});

test("parseGdacsEventFeature: falls back to bbox center when geometry isn't a Point", () => {
  const row = parseGdacsEventFeature({
    bbox: [10, 20, 12, 22],
    properties: { eventtype: "FL", eventid: "123", name: "Bbox fallback" },
    geometry: { type: "Polygon", coordinates: [] },
  });
  assert.ok(row);
  assert.equal(row.lng, 11);
  assert.equal(row.lat, 21);
});

test("parseGdacsEventFeature: missing alertlevel/alertscore/iso3/dates/report url all degrade to documented defaults, not a dropped row", () => {
  const row = parseGdacsEventFeature({
    properties: {
      eventtype: "WF",
      eventid: "555",
      name: "Sparse wildfire record",
      // no alertlevel, alertscore, iso3, fromdate, todate, url
    },
    geometry: { type: "Point", coordinates: [30, 40] },
  });
  assert.ok(row);
  assert.equal(row.alertLevel, "Green");
  assert.equal(row.alertScore, null);
  assert.equal(row.countryIso, null);
  assert.equal(row.startTime, null);
  assert.equal(row.endTime, null);
  assert.equal(row.reportUrl, null);
  assert.equal(row.title, "Sparse wildfire record");
});

test("parseGdacsEventFeature: an invalid/unrecognized alertlevel string also degrades to Green rather than being dropped", () => {
  const row = parseGdacsEventFeature({
    properties: { eventtype: "DR", eventid: "777", name: "Weird alert level", alertlevel: "Purple" },
    geometry: { type: "Point", coordinates: [0, 0] },
  });
  assert.ok(row);
  assert.equal(row.alertLevel, "Green");
});

test("parseGdacsEventFeature: a feature with no name falls back to description, then to a synthetic type-id title", () => {
  const withDescription = parseGdacsEventFeature({
    properties: { eventtype: "VO", eventid: "1", description: "Eruption somewhere" },
    geometry: { type: "Point", coordinates: [0, 0] },
  });
  assert.equal(withDescription.title, "Eruption somewhere");

  const withNeither = parseGdacsEventFeature({
    properties: { eventtype: "VO", eventid: "2" },
    geometry: { type: "Point", coordinates: [0, 0] },
  });
  assert.equal(withNeither.title, "VO-2");
});

test("episode-update scenario: the same (eventType, eventId) reparsed at a later episode keeps its identity but reflects the new episode/alert state", () => {
  const originalFeature = eventListFixture.features.find((f) => f.properties.eventtype === "TC");

  const earlierEpisode = parseGdacsEventFeature({
    ...originalFeature,
    properties: { ...originalFeature.properties, episodeid: 1, alertlevel: "Green", alertscore: 1 },
  });
  const laterEpisode = parseGdacsEventFeature({
    ...originalFeature,
    properties: { ...originalFeature.properties, episodeid: 3, alertlevel: "Red", alertscore: 3 },
  });

  // Same identity — this is what gdacs_events' UNIQUE KEY (event_type,
  // event_id) matches on, so the real upsert (queries.ts) would UPDATE the
  // same row rather than inserting a second one.
  assert.equal(earlierEpisode.eventType, laterEpisode.eventType);
  assert.equal(earlierEpisode.eventId, laterEpisode.eventId);
  // ...but the episode-dependent fields differ, which is exactly what the
  // UPDATE clause overwrites the stored row with.
  assert.notEqual(earlierEpisode.episodeId, laterEpisode.episodeId);
  assert.notEqual(earlierEpisode.alertLevel, laterEpisode.alertLevel);
  assert.equal(earlierEpisode.episodeId, "1");
  assert.equal(laterEpisode.episodeId, "3");
});

test("extractTcTrack: keeps only the LineString track segments and the current-position centroid from a live getgeometry response", () => {
  const track = extractTcTrack(tcTrackFixture);
  assert.ok(track);
  assert.equal(track.type, "FeatureCollection");
  assert.ok(track.features.length > 0);

  for (const feature of track.features) {
    const isTrackLine = feature.geometry.type === "LineString";
    const isCentroid = feature.properties?.Class === "Point_Centroid";
    assert.ok(isTrackLine || isCentroid, `unexpected feature kept: ${feature.geometry.type} / ${feature.properties?.Class}`);
    // The heavy per-forecast-point wind-radii circles must be filtered out.
    assert.ok(!/Point_Polygon_Point/.test(feature.properties?.Class ?? ""));
  }
});

test("extractTcTrack: returns null for an empty or malformed payload", () => {
  assert.equal(extractTcTrack(null), null);
  assert.equal(extractTcTrack({}), null);
  assert.equal(extractTcTrack({ type: "FeatureCollection", features: [] }), null);
});
