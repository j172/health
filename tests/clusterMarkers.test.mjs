import test from "node:test";
import assert from "node:assert/strict";

const { clusterMarkers } = await import("../components/Map/clusterMarkers.ts");

test("clusterMarkers groups nearby points at a low (zoomed-out) zoom level", () => {
  // Two points ~110m apart (0.001 degree of latitude) — at zoom 10 that's well
  // within a typical cluster radius; at zoom 18 they should stay separate.
  const markers = [
    { id: "a", lat: 25.0, lng: 121.5 },
    { id: "b", lat: 25.001, lng: 121.5 },
  ];

  const lowZoomClusters = clusterMarkers(markers, 10);
  assert.equal(lowZoomClusters.length, 1, "two nearby points should collapse into one cluster when zoomed out");
  assert.equal(lowZoomClusters[0].count, 2);
  assert.deepEqual(
    lowZoomClusters[0].members.map((m) => m.id).sort(),
    ["a", "b"],
  );
});

test("clusterMarkers keeps far-apart points separate once zoomed in enough that their pixel distance exceeds the radius", () => {
  const markers = [
    { id: "taipei", lat: 25.033, lng: 121.5654 },
    { id: "kaohsiung", lat: 22.6273, lng: 120.3014 },
  ];

  // Taipei/Kaohsiung are ~300km apart; at the Taiwan-wide zoom levels actually
  // used by this site's map tools (8–13, see e.g. DisasterMapLeaflet's default
  // zoom=13) that is already far more than the 60px default cluster radius.
  for (const zoom of [8, 13]) {
    const clusters = clusterMarkers(markers, zoom);
    assert.equal(clusters.length, 2, `Taipei and Kaohsiung must not cluster together at zoom ${zoom}`);
    assert.ok(clusters.every((c) => c.count === 1));
  }
});

test("clusterMarkers merges even far-apart points at a world-scale zoom level, where 60px covers hundreds of km", () => {
  const markers = [
    { id: "taipei", lat: 25.033, lng: 121.5654 },
    { id: "kaohsiung", lat: 22.6273, lng: 120.3014 },
  ];
  const clusters = clusterMarkers(markers, 3);
  assert.equal(clusters.length, 1, "at zoom 3 the whole map is ~2048px wide, so 60px covers far more than 300km");
});

test("clusterMarkers disables clustering entirely at or above disableClusteringAtZoom", () => {
  const markers = [
    { id: "a", lat: 25.0, lng: 121.5 },
    { id: "b", lat: 25.0001, lng: 121.5 }, // ~11m apart — would always cluster otherwise
  ];

  const clusters = clusterMarkers(markers, 17, { disableClusteringAtZoom: 17 });
  assert.equal(clusters.length, 2, "at/above the configured zoom, every marker should render individually");
  assert.ok(clusters.every((c) => c.count === 1));
});

test("clusterMarkers respects a custom radiusPx", () => {
  const markers = [
    { id: "a", lat: 25.0, lng: 121.5 },
    { id: "b", lat: 25.01, lng: 121.5 }, // ~1.1km apart
  ];

  const tight = clusterMarkers(markers, 10, { radiusPx: 1 });
  assert.equal(tight.length, 2, "a tiny radius should not merge points over a km apart");

  const loose = clusterMarkers(markers, 10, { radiusPx: 5000 });
  assert.equal(loose.length, 1, "a very large radius should merge them");
});

test("clusterMarkers returns a cluster centroid within the bounding area of its members", () => {
  const markers = [
    { id: "a", lat: 25.0, lng: 121.5 },
    { id: "b", lat: 25.002, lng: 121.502 },
  ];
  const [cluster] = clusterMarkers(markers, 10);
  assert.equal(cluster.count, 2);
  assert.ok(cluster.lat >= 25.0 && cluster.lat <= 25.002);
  assert.ok(cluster.lng >= 121.5 && cluster.lng <= 121.502);
});

test("clusterMarkers ignores markers with non-finite coordinates instead of throwing", () => {
  const markers = [
    { id: "a", lat: 25.0, lng: 121.5 },
    { id: "bad-lat", lat: NaN, lng: 121.5 },
    { id: "bad-lng", lat: 25.0, lng: Infinity },
  ];
  const clusters = clusterMarkers(markers, 10);
  const allIds = clusters.flatMap((c) => c.members.map((m) => m.id));
  assert.deepEqual(allIds, ["a"]);
});

test("clusterMarkers handles an empty marker list", () => {
  assert.deepEqual(clusterMarkers([], 10), []);
});

test("clusterMarkers never drops or duplicates markers", () => {
  const markers = Array.from({ length: 50 }, (_, i) => ({
    id: `m${i}`,
    lat: 25 + (i % 10) * 0.01,
    lng: 121 + Math.floor(i / 10) * 0.01,
  }));
  const clusters = clusterMarkers(markers, 12);
  const seen = clusters.flatMap((c) => c.members.map((m) => m.id));
  assert.equal(seen.length, markers.length, "every input marker must appear in exactly one cluster");
  assert.equal(new Set(seen).size, markers.length, "no marker id should appear twice");
});
