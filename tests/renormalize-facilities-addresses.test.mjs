import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeFacilityAddress,
  shouldResetCoordinates,
} from "../lib/server/facilities/addressRules.mjs";

test("normalizeFacilityAddress: converts full-width digits to half-width", () => {
  assert.equal(
    normalizeFacilityAddress("台北市信義區信義路五段７號１０樓"),
    "台北市信義區信義路五段7號10樓"
  );
});

test("normalizeFacilityAddress: strips parenthetical notes (both brackets and styles)", () => {
  assert.equal(
    normalizeFacilityAddress("新北市板橋區縣民大道二段7號(1樓)(板橋車站旁)"),
    "新北市板橋區縣民大道二段7號"
  );
  assert.equal(
    normalizeFacilityAddress("台中市西區民生路100號（環境衛生科）"),
    "台中市西區民生路100號"
  );
  assert.equal(
    normalizeFacilityAddress("台南市永康區中華路1號【臨時辦公室】"),
    "台南市永康區中華路1號"
  );
});

test("normalizeFacilityAddress: splits multi-address on comma or 及", () => {
  assert.equal(
    normalizeFacilityAddress("高雄市苓雅區四維三路2號，苓雅一路10號"),
    "高雄市苓雅區四維三路2號"
  );
  assert.equal(
    normalizeFacilityAddress("新竹市東區光復路二段101號及大學路1001號"),
    "新竹市東區光復路二段101號"
  );
});

test("normalizeFacilityAddress: deduplicates repeated county/district prefixes", () => {
  assert.equal(
    normalizeFacilityAddress("新北市土城區新北市土城區中正路18號6樓"),
    "新北市土城區中正路18號6樓"
  );
  assert.equal(
    normalizeFacilityAddress("臺中市中市北屯區和平里東山路二段1號"),
    "臺中市北屯區和平里東山路二段1號"
  );
});

test("normalizeFacilityAddress: handles whitespace, fullwidth space and quotes", () => {
  assert.equal(
    normalizeFacilityAddress("　基隆市仁愛區　仁一路 293號 \"1樓\" "),
    "基隆市仁愛區 仁一路 293號 1樓"
  );
});

test("shouldResetCoordinates: protects official GPS sources with existing coordinates", () => {
  assert.equal(shouldResetCoordinates("nhi_hospital", 25.033), false);
  assert.equal(shouldResetCoordinates("nhi_pharmacy", 24.123), false);
  assert.equal(shouldResetCoordinates("moe_kindergarten", 23.567), false);
  assert.equal(shouldResetCoordinates("mohw_ltc_contracted", 22.987), false);
  assert.equal(shouldResetCoordinates("mohw_ltc_full", 25.012), false);
  assert.equal(shouldResetCoordinates("mohw_hpa_facility", 24.8), false);
  assert.equal(shouldResetCoordinates("nhi_home_healthcare", 25.1), false);
  assert.equal(shouldResetCoordinates("moenv_public_toilet", 25.05), false);
  assert.equal(shouldResetCoordinates("moenv_cool_spot", 24.5), false);
  assert.equal(shouldResetCoordinates("moenv_green_restaurant", 24.0), false);
  assert.equal(shouldResetCoordinates("moenv_green_hotel", 23.9), false);
});

test("shouldResetCoordinates: resets official GPS sources IF coordinates are missing (lat is null)", () => {
  assert.equal(shouldResetCoordinates("nhi_hospital", null), true);
  assert.equal(shouldResetCoordinates("nhi_pharmacy", null), true);
  assert.equal(shouldResetCoordinates("moe_kindergarten", null), true);
});

test("shouldResetCoordinates: resets non-whitelisted text-estimated sources even if coords exist", () => {
  assert.equal(shouldResetCoordinates("npo_tw", 25.04), true);
  assert.equal(shouldResetCoordinates("tax_organization", 24.15), true);
  assert.equal(shouldResetCoordinates("moe_cram_school", 22.6), true);
  assert.equal(shouldResetCoordinates("mohw_elder_welfare", 25.0), true);
  assert.equal(shouldResetCoordinates("mohw_disability_welfare", 24.5), true);
  assert.equal(shouldResetCoordinates("moenv_iaq_premise", 23.5), true);
});
