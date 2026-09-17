import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  TAIWAN_COUNTIES,
  TAIWAN_COUNTY_DISTRICTS,
  TAIWAN_COUNTY_CENTROIDS,
  normalizeCountyName,
  getDistrictsForCounty,
} from "../lib/constants/taiwanDistricts.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

test("Pagination specification constants contract", () => {
  const paginationTs = fs.readFileSync(path.join(ROOT_DIR, "lib/hooks/usePagination.ts"), "utf-8");
  assert.ok(paginationTs.includes("export const PAGE_SIZE_OPTIONS = [30, 50, 100]"), "PAGE_SIZE_OPTIONS must be [30, 50, 100]");
  assert.ok(paginationTs.includes("export const DEFAULT_PAGE_SIZE: PageSizeOption = 30;"), "DEFAULT_PAGE_SIZE must be 30");
});

test("Taiwan geographic dictionary coverage", () => {
  assert.equal(TAIWAN_COUNTIES.length, 22, "Taiwan must have 22 counties");
  
  let totalDistricts = 0;
  for (const county of TAIWAN_COUNTIES) {
    const districts = getDistrictsForCounty(county);
    assert.ok(districts.length > 0, `County ${county} should have districts`);
    assert.ok(TAIWAN_COUNTY_CENTROIDS[county], `County ${county} should have centroid coords`);
    totalDistricts += districts.length;
  }
  assert.equal(totalDistricts, 368, "Taiwan must have exactly 368 districts");
});

test("County name normalization handles variations", () => {
  assert.equal(normalizeCountyName("台北市"), "臺北市");
  assert.equal(normalizeCountyName("臺北市"), "臺北市");
  assert.equal(normalizeCountyName("台中市"), "臺中市");
  assert.equal(normalizeCountyName("臺中市"), "臺中市");
  assert.equal(normalizeCountyName("台南市"), "臺南市");
  assert.equal(normalizeCountyName("臺南市"), "臺南市");
  assert.equal(normalizeCountyName("台東縣"), "臺東縣");
  assert.equal(normalizeCountyName("臺東縣"), "臺東縣");
  assert.equal(normalizeCountyName("高雄市"), "高雄市");
  assert.equal(normalizeCountyName(""), "");
});

test("Two-tier CountyDistrictPicker component exists and conforms to UI spec", () => {
  const pickerPath = path.join(ROOT_DIR, "components/Facilities/CountyDistrictPicker.tsx");
  assert.ok(fs.existsSync(pickerPath), "CountyDistrictPicker.tsx must exist");
  const content = fs.readFileSync(pickerPath, "utf-8");
  assert.ok(content.includes("export default function CountyDistrictPicker"), "Must export CountyDistrictPicker default");
  assert.ok(content.includes("TAIWAN_COUNTIES"), "Must use TAIWAN_COUNTIES");
  assert.ok(content.includes("getDistrictsForCounty"), "Must use getDistrictsForCounty");
});

test("FacilitySearchContent integrates server pagination and CountyDistrictPicker", () => {
  const componentPath = path.join(ROOT_DIR, "components/Facilities/FacilitySearchContent.tsx");
  const content = fs.readFileSync(componentPath, "utf-8");
  assert.ok(content.includes("CountyDistrictPicker"), "Must include CountyDistrictPicker");
  assert.ok(content.includes("usePagination"), "Must include usePagination");
  assert.ok(content.includes("limit: String(pageSize)"), "Must query server with limit");
  assert.ok(content.includes("offset: String(offset)"), "Must query server with offset");
  assert.ok(content.includes("totalItems={totalCount}"), "Must pass total count to Pagination");
});
