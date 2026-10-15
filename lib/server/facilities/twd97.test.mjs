// Unit tests for lib/server/facilities/twd97.ts — run with `npm test`.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + extension, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { twd97ToWgs84, isWithinTaiwanBounds } = await import("./twd97.ts");

// Real X坐標/Y坐標 pair taken from a live row of 臺中市公私協力及私立托嬰中心
// (dataset 83669, confirmed live 2026-10-14): "臺中市東區東勢里17鄰進化路221
// 巷25號1-3樓" — expected to land in 臺中市東區 (~lat 24.13–24.16, lng 120.68–120.70).
test("twd97ToWgs84: converts a real 83669 X/Y pair into 臺中市東區", () => {
  const point = twd97ToWgs84(218777.003, 2671649.703);
  assert.ok(point, "expected a non-null result");
  assert.ok(point.lat > 24.1 && point.lat < 24.2, `lat ${point.lat} out of expected 臺中市東區 range`);
  assert.ok(point.lng > 120.6 && point.lng < 120.8, `lng ${point.lng} out of expected 臺中市東區 range`);
});

test("twd97ToWgs84: a second real 83669 X/Y pair also lands in Taichung", () => {
  const point = twd97ToWgs84(219304.532, 2670293.385);
  assert.ok(point, "expected a non-null result");
  assert.ok(point.lat > 24.1 && point.lat < 24.2, `lat ${point.lat} out of expected range`);
  assert.ok(point.lng > 120.6 && point.lng < 120.8, `lng ${point.lng} out of expected range`);
});

test("twd97ToWgs84: returns null for non-finite input instead of throwing", () => {
  assert.equal(twd97ToWgs84(NaN, 2671649.703), null);
  assert.equal(twd97ToWgs84(218777.003, undefined), null);
});

test("twd97ToWgs84: returns null when the converted point falls outside Taiwan (e.g. swapped X/Y)", () => {
  // Swapping X and Y for this real pair sends the result far outside Taiwan's bounds.
  const point = twd97ToWgs84(2671649.703, 218777.003);
  assert.equal(point, null);
});

test("isWithinTaiwanBounds: rejects NaN and out-of-range coordinates", () => {
  assert.equal(isWithinTaiwanBounds(NaN, 121), false);
  assert.equal(isWithinTaiwanBounds(0, 0), false);
  assert.equal(isWithinTaiwanBounds(24.15, 120.68), true);
});

// ---------------------------------------------------------------------------
// Issue #677 (B-9, 5958 派出所): central-meridian parameter and the
// offshore-island rows.
//
// Independent reference: __fixtures__/tm2-forward.mjs is Krüger's n-series (Karney
// 2011), a different algorithm family from the Snyder inverse series twd97.ts
// implements, so `forward -> inverse` and `inverse -> forward` round trips are a real
// cross-check, not a restatement of the code under test. Both directions are
// exercised for 119°E and 121°E.
// ---------------------------------------------------------------------------

const { krugerForward } = await import("./__fixtures__/tm2-forward.mjs");

// Known places, WGS84 (accurate to ~100 m, which is all the county-landing
// assertions below need).
const KNOWN_POINTS = [
  { name: "臺北車站", lat: 25.0478, lng: 121.517 },
  { name: "澎湖縣馬公市治平路", lat: 23.5701, lng: 119.5659 },
  { name: "金門縣金城鎮金山路", lat: 24.4286, lng: 118.3224 },
  { name: "連江縣南竿鄉介壽村", lat: 26.1574, lng: 119.9511 },
];

test("twd97ToWgs84: zone defaults to 121°E, so every existing caller is unchanged", () => {
  const explicit = twd97ToWgs84(218777.003, 2671649.703, { centralMeridianDeg: 121 });
  assert.deepEqual(explicit, twd97ToWgs84(218777.003, 2671649.703));
});

for (const zone of [121, 119]) {
  test(`twd97ToWgs84: round-trips the independent ${zone}°E Krüger forward projection (known points)`, () => {
    for (const p of KNOWN_POINTS) {
      const { x, y } = krugerForward(p.lat, p.lng, zone);
      const back = twd97ToWgs84(x, y, { centralMeridianDeg: zone });
      // Points far outside the zone's own meridian (e.g. Taipei in the 119°E zone is
      // 2.5° away) must still invert; only the Taiwan bounds guard may null a point.
      assert.ok(back, `${p.name} (${zone}°E): expected a non-null inverse`);
      assert.ok(Math.abs(back.lat - p.lat) < 2e-6, `${p.name} (${zone}°E): lat ${back.lat} vs ${p.lat}`);
      assert.ok(Math.abs(back.lng - p.lng) < 2e-6, `${p.name} (${zone}°E): lng ${back.lng} vs ${p.lng}`);
    }
  });
}

test("twd97ToWgs84: the same ground point has different X in the two zones, and each zone only inverts its own X", () => {
  const p = KNOWN_POINTS[1]; // 澎湖
  const in119 = krugerForward(p.lat, p.lng, 119);
  const in121 = krugerForward(p.lat, p.lng, 121);
  assert.ok(in119.x > 280000 && in119.x < 340000, `119°E X for 澎湖 should be ~307000, got ${in119.x}`);
  assert.ok(in121.x < 150000 && in121.x > 50000, `121°E X for 澎湖 should be ~104000, got ${in121.x}`);
  // 119°E numbers read as 121°E land ~2° east, in the sea off Hualien — not 澎湖.
  const misread = twd97ToWgs84(in119.x, in119.y);
  assert.ok(misread && misread.lng > 121, `119°E X misread as 121°E should land east of 121°E, got ${misread?.lng}`);
});

// Real rows from the 5958 release 1150930 (data.gov.tw dataset 5958, downloaded 2026-10-16):
// the 43 offshore-island rows are published in the 121°E grid with the false-easting origin
// extended past Taiwan's west coast (金門 X is negative). The existing 121°E inverse must
// already convert them; the point of these cases is to lock that in against real data.
const OFFSHORE_REAL_ROWS = [
  { name: "澎湖縣政府警察局", x: 103598.2991, y: 2608149.162, bbox: [23.15, 23.85, 119.25, 119.8] },
  { name: "七美分駐所", x: 88595.1441, y: 2568090.642, bbox: [23.15, 23.85, 119.25, 119.8] },
  { name: "花嶼派出所", x: 78430.6213, y: 2589595.088, bbox: [23.15, 23.85, 119.25, 119.8] },
  { name: "金門縣警察局", x: -21575.4256, y: 2705112.582, bbox: [24.3, 24.6, 118.1, 118.6] },
  { name: "烈嶼分駐所", x: -29658.1254, y: 2705779.83, bbox: [24.3, 24.6, 118.1, 118.6] },
  { name: "福建省連江縣警察局", x: 145131.6436, y: 2894404.988, bbox: [25.9, 26.45, 119.85, 120.6] },
  { name: "東引警察所", x: 199074.5109, y: 2917379.884, bbox: [25.9, 26.45, 119.85, 120.6] },
];

test("twd97ToWgs84: real 澎湖/金門/連江 rows from 5958 convert (default 121°E) and land inside their counties", () => {
  for (const row of OFFSHORE_REAL_ROWS) {
    const p = twd97ToWgs84(row.x, row.y);
    assert.ok(p, `${row.name}: expected non-null (the 121°E inverse must handle the extended grid)`);
    const [minLat, maxLat, minLng, maxLng] = row.bbox;
    assert.ok(p.lat >= minLat && p.lat <= maxLat && p.lng >= minLng && p.lng <= maxLng, `${row.name}: ${JSON.stringify(p)} outside its county box`);
  }
});

test("twd97ToWgs84: real offshore rows round-trip through the independent forward projection to within 1 m", () => {
  for (const row of OFFSHORE_REAL_ROWS) {
    const p = twd97ToWgs84(row.x, row.y);
    const fwd = krugerForward(p.lat, p.lng, 121);
    assert.ok(Math.abs(fwd.x - row.x) < 1 && Math.abs(fwd.y - row.y) < 1, `${row.name}: forward(inverse(x,y)) = ${fwd.x},${fwd.y} vs ${row.x},${row.y}`);
  }
});
