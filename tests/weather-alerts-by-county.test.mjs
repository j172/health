import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "./helpers/register-ts-alias-hooks.mjs";

// "依定位看特報" — the visitor's GPS resolves to a county, and that county's active
// alerts are shown directly, instead of making them scan the full nationwide list.
// W-C0033-001 (鄉鎮天氣現象及危害) was already synced and merged into the existing
// listActiveCwaAlerts() result; this adds a pure filter over that same data, not a
// second query, so it can never disagree with the full-list widget beside it.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...segments) => fs.readFileSync(path.join(ROOT, ...segments), "utf-8");

const { resolveNearestCounty, isWithinCountyBounds } = await import("../lib/server/facilities/countyBounds.ts");
const { filterCwaAlertsByCounty } = await import("../lib/server/cwa/filterAlertsByCounty.ts");

test("resolveNearestCounty: a point inside a county's real boundary returns that county", () => {
  assert.equal(resolveNearestCounty(25.04, 121.56), "臺北市"); // 台北市政府一帶
  assert.equal(resolveNearestCounty(22.63, 120.3), "高雄市");
});

test("resolveNearestCounty: returns null for a point outside every county's real boundary (open sea)", () => {
  const result = resolveNearestCounty(24.0, 123.5); // far off the east coast
  assert.equal(result, null);
});

// Regression test for the live incident this change fixes: New Taipei City geographically
// wraps around Taipei City, so the old bounding-box heuristic had Taipei's loose box sitting
// entirely inside New Taipei's — any New Taipei district that fell inside both boxes (which
// the old code treated as ambiguous) resolved to whichever box's *center* was nearest, and
// Taipei's center was consistently the nearer one. Confirmed live during an active typhoon
// warning: visitors in these New Taipei districts saw "no alerts" for 臺北市 (which had none)
// instead of their real county 新北市 (which did). Point-in-polygon against the real boundary
// must get every one of these right.
test("resolveNearestCounty: New Taipei districts that wrap around Taipei resolve to 新北市, not 臺北市", () => {
  assert.equal(resolveNearestCounty(25.036, 121.449), "新北市"); // 新莊區 — the confirmed live incident
  assert.equal(resolveNearestCounty(25.0137, 121.4625), "新北市"); // 板橋區
  assert.equal(resolveNearestCounty(25.0633, 121.4874), "新北市"); // 三重區
  assert.equal(resolveNearestCounty(25.0078, 121.5154), "新北市"); // 永和區
  assert.equal(resolveNearestCounty(24.9998, 121.4984), "新北市"); // 中和區
});

test("resolveNearestCounty: Taipei City districts still resolve to 臺北市, not misclassified the other way", () => {
  assert.equal(resolveNearestCounty(25.0914, 121.5267), "臺北市"); // 士林區
  assert.equal(resolveNearestCounty(25.0831, 121.5891), "臺北市"); // 內湖區
  assert.equal(resolveNearestCounty(24.9887, 121.5701), "臺北市"); // 文山區
});

test("resolveNearestCounty: spot-checks near other counties' borders resolve correctly", () => {
  assert.equal(resolveNearestCounty(24.9167, 121.1472), "桃園市"); // 楊梅區 (near the 新竹縣 border)
  assert.equal(resolveNearestCounty(24.8989, 121.0414), "新竹縣"); // 湖口鄉
  assert.equal(resolveNearestCounty(23.8988, 120.3764), "彰化縣"); // 二林鎮 (near the 雲林縣 border)
  assert.equal(resolveNearestCounty(23.7444, 120.4891), "雲林縣"); // 莿桐鄉
  assert.equal(resolveNearestCounty(22.7936, 120.2944), "高雄市"); // 岡山區 (near the 臺南市/屏東縣 side)
  assert.equal(resolveNearestCounty(22.7144, 120.5106), "屏東縣"); // 九如鄉
});

test("filterCwaAlertsByCounty: matches both the 臺 and 台 spelling in area_desc", () => {
  const alerts = [
    { id: 1, area_desc: "臺北市、新北市" },
    { id: 2, area_desc: "台北市大安區" },
    { id: 3, area_desc: "高雄市" },
  ];
  const matched = filterCwaAlertsByCounty(alerts, "臺北市");
  assert.deepEqual(matched.map((a) => a.id).sort(), [1, 2]);
});

test("filterCwaAlertsByCounty: an alert with a null area_desc never matches", () => {
  const alerts = [{ id: 1, area_desc: null }];
  assert.deepEqual(filterCwaAlertsByCounty(alerts, "臺北市"), []);
});

test("filterCwaAlertsByCounty: an unrelated county's alert is excluded", () => {
  const alerts = [{ id: 1, area_desc: "高雄市、屏東縣" }];
  assert.deepEqual(filterCwaAlertsByCounty(alerts, "臺北市"), []);
});

test("/api/weather/rainfall only resolves county/countyAlerts when lat/lng are given, not for the county-dropdown path", () => {
  const src = read("app", "api", "weather", "rainfall", "route.ts");
  assert.match(src, /const county = hasCoords \? resolveNearestCounty\(lat, lng\) : null;/);
  assert.match(src, /const countyAlerts = county \? filterCwaAlertsByCounty\(activeAlerts, county\) : null;/);
  assert.match(src, /import \{ resolveNearestCounty \} from "@\/lib\/server\/facilities\/countyBounds"/);
  assert.match(src, /import \{ filterCwaAlertsByCounty \} from "@\/lib\/server\/cwa\/filterAlertsByCounty"/);
});

test("WeatherRainfallLocator renders the county-alerts summary only once a location has resolved", () => {
  const src = read("components", "Tools", "WeatherRainfallLocator.tsx");
  assert.match(src, /\{resolvedCounty && countyAlerts && \(/);
  assert.match(src, /setResolvedCounty\(json\.data\.county \?\? null\)/);
  assert.match(src, /setCountyAlerts\(json\.data\.countyAlerts \?\? null\)/);
});

// isWithinCountyBounds is unrelated to resolveNearestCounty's point-in-polygon lookup now
// (see countyGeo.ts) — it's still used elsewhere (geocodeBatch.ts, autoGeocode.ts,
// policeStations5958.ts) as a deliberately loose sanity check on geocoding results, so its
// own loose-bounding-box behavior must be unchanged.
test("isWithinCountyBounds still behaves as the pre-existing function did", () => {
  assert.equal(isWithinCountyBounds("臺北市", 25.04, 121.56), true);
  assert.equal(isWithinCountyBounds("高雄市", 25.04, 121.56), false);
});
