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

test("resolveNearestCounty: a point inside exactly one county's bounds returns that county", () => {
  assert.equal(resolveNearestCounty(25.04, 121.56), "臺北市"); // 台北市政府一帶
  assert.equal(resolveNearestCounty(22.63, 120.3), "高雄市");
});

test("resolveNearestCounty: never returns null/undefined, even for a point outside every county's bounds (open sea)", () => {
  const result = resolveNearestCounty(24.0, 123.5); // far off the east coast
  assert.equal(typeof result, "string");
  assert.ok(result.length > 0);
});

test("resolveNearestCounty's fallback actually picks the nearest center, not just the first county in iteration order", () => {
  // A point just east of 宜蘭縣's box (outside every county) should resolve to 宜蘭縣,
  // not to an unrelated county that merely sorts earlier in BOUNDS' key order.
  const result = resolveNearestCounty(24.6, 122.2);
  assert.equal(result, "宜蘭縣");
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

// isWithinCountyBounds already existed before this change — sanity-check it still works,
// since resolveNearestCounty's containment pass depends on it.
test("isWithinCountyBounds still behaves as the pre-existing function did", () => {
  assert.equal(isWithinCountyBounds("臺北市", 25.04, 121.56), true);
  assert.equal(isWithinCountyBounds("高雄市", 25.04, 121.56), false);
});
