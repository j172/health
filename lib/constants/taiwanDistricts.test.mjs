import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAIWAN_COUNTIES,
  TAIWAN_COUNTY_DISTRICTS,
  TAIWAN_COUNTY_CENTROIDS,
  normalizeCountyName,
  getDistrictsForCounty,
} from "./taiwanDistricts.ts";

test("taiwanDistricts constants covers all 22 counties", () => {
  assert.equal(TAIWAN_COUNTIES.length, 22);
  for (const county of TAIWAN_COUNTIES) {
    assert.ok(TAIWAN_COUNTY_DISTRICTS[county], `Missing districts for ${county}`);
    assert.ok(TAIWAN_COUNTY_DISTRICTS[county].length > 0, `Empty districts for ${county}`);
    assert.ok(TAIWAN_COUNTY_CENTROIDS[county], `Missing centroid for ${county}`);
  }
});

test("taiwanDistricts covers exactly 368 districts", () => {
  let totalDistricts = 0;
  for (const county of TAIWAN_COUNTIES) {
    totalDistricts += TAIWAN_COUNTY_DISTRICTS[county].length;
  }
  assert.equal(totalDistricts, 368);
});

test("normalizeCountyName normalizes variant forms", () => {
  assert.equal(normalizeCountyName("臺北市"), "臺北市");
  assert.equal(normalizeCountyName("台北市"), "臺北市");
  assert.equal(normalizeCountyName("臺中市"), "臺中市");
  assert.equal(normalizeCountyName("台中市"), "臺中市");
  assert.equal(normalizeCountyName("臺南市"), "臺南市");
  assert.equal(normalizeCountyName("台南市"), "臺南市");
  assert.equal(normalizeCountyName("臺東縣"), "臺東縣");
  assert.equal(normalizeCountyName("台東縣"), "臺東縣");
  assert.equal(normalizeCountyName("高雄市"), "高雄市");
});

test("getDistrictsForCounty returns expected districts", () => {
  const tpeDistricts = getDistrictsForCounty("台北市");
  assert.ok(tpeDistricts.includes("中正區"));
  assert.ok(tpeDistricts.includes("大安區"));
  assert.equal(tpeDistricts.length, 12);

  const tpeVariant = getDistrictsForCounty("臺北市");
  assert.equal(tpeVariant.length, 12);

  assert.deepEqual(getDistrictsForCounty(""), []);
});
