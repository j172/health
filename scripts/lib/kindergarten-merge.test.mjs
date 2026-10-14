import test from "node:test";
import assert from "node:assert/strict";

import { mergeKindergartenSources, deriveKiangCategory, stripPostalPrefix } from "./kindergarten-merge.mjs";

const FRESH_DATE = new Date(); // "just fetched"
const STALE_DATE = new Date(Date.now() - 61 * 24 * 60 * 60 * 1000); // 61 days ago

function moeRecord(overrides = {}) {
  return {
    facilityType: "kindergarten",
    sourceKey: "moe_kindergarten",
    sourceId: "k_001_台北市私立測試幼兒園_台北市中正區測試路1號",
    name: "台北市私立測試幼兒園",
    address: "台北市中正區測試路1號",
    phone: "(02)12345678",
    lat: null,
    lng: null,
    serviceItem: "私立幼兒園",
    serviceTime: "學年度：114",
    dataOrg: "教育部統計處",
    extra: {
      schoolCode: "001",
      ownership: "私立",
      city: "台北市",
      district: "中正區",
      year: "114",
    },
    ...overrides,
  };
}

function kiangRecord(overrides = {}) {
  return {
    title: "台北市私立測試幼兒園",
    city: "台北市",
    town: "中正區",
    type: "私立",
    address: "[100]測試路1號",
    pre_public: "無",
    penalty: "無",
    monthly: 3500,
    ...overrides,
  };
}

test("mergeKindergartenSources: fresh kiang data + matched name/city merges category/monthlyFee/hasPenalty and upgrades serviceItem", () => {
  const moe = [moeRecord()];
  const kiang = [kiangRecord({ type: "非營利", pre_public: "無", penalty: "有", monthly: 2000 })];

  const result = mergeKindergartenSources(moe, kiang, FRESH_DATE);

  assert.equal(result.length, 1);
  assert.equal(result[0].serviceItem, "非營利幼兒園");
  assert.equal(result[0].extra.category, "非營利");
  assert.equal(result[0].extra.monthlyFee, 2000);
  assert.equal(result[0].extra.hasPenalty, true);
  // Original MOE fields must survive the merge untouched.
  assert.equal(result[0].name, moe[0].name);
  assert.equal(result[0].extra.ownership, "私立");
});

test("mergeKindergartenSources: fresh kiang data derives 準公共 (private + an active pre_public contract), not a 4th `type` value", () => {
  const moe = [moeRecord()];
  const kiang = [kiangRecord({ type: "私立", pre_public: "113-115", penalty: "無", monthly: 2500 })];

  const result = mergeKindergartenSources(moe, kiang, FRESH_DATE);

  assert.equal(result[0].extra.category, "準公共");
  assert.equal(result[0].serviceItem, "準公共幼兒園");
  assert.equal(result[0].extra.hasPenalty, false);
});

test("mergeKindergartenSources: hasPenalty is false for kiang's '無' string, not a truthiness check on the raw string", () => {
  const moe = [moeRecord()];
  // "無" is a non-empty string — Boolean("無") is true — so a naive
  // truthiness check on the raw field would wrongly mark this as penalized.
  const kiang = [kiangRecord({ penalty: "無" })];

  const result = mergeKindergartenSources(moe, kiang, FRESH_DATE);

  assert.equal(result[0].extra.hasPenalty, false);
});

test("mergeKindergartenSources: fresh kiang data but no name+city match keeps the plain MOE record untouched (no extra fields added)", () => {
  const moe = [moeRecord()];
  const kiang = [kiangRecord({ title: "新北市私立完全不同幼兒園", city: "新北市" })];

  const result = mergeKindergartenSources(moe, kiang, FRESH_DATE);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0], moe[0]);
  assert.equal(result[0].extra.category, undefined);
  assert.equal(result[0].extra.monthlyFee, undefined);
  assert.equal(result[0].extra.hasPenalty, undefined);
  assert.equal(result[0].serviceItem, "私立幼兒園");
});

test("mergeKindergartenSources: matching ignores 臺/台 variant and whitespace differences between the two sources", () => {
  const moe = [moeRecord({ name: "臺北市私立測試幼兒園", extra: { ...moeRecord().extra, city: "臺北市" } })];
  const kiang = [kiangRecord({ title: "台北市私立測試幼兒園", city: "台北市" })];

  const result = mergeKindergartenSources(moe, kiang, FRESH_DATE);

  assert.equal(result[0].extra.category, "私立");
});

test("mergeKindergartenSources: kiangFetchedAt more than 60 days old ignores kiang data entirely — identical output to passing zero kiang records", () => {
  const moe = [moeRecord(), moeRecord({ name: "台北市公立測試二幼兒園", serviceItem: "公立幼兒園", extra: { ...moeRecord().extra, ownership: "公立" } })];
  const kiang = [kiangRecord({ type: "非營利", monthly: 2200, penalty: "有" })];

  const staleResult = mergeKindergartenSources(moe, kiang, STALE_DATE);
  const noKiangResult = mergeKindergartenSources(moe, [], FRESH_DATE);

  assert.deepEqual(staleResult, noKiangResult);
  assert.deepEqual(staleResult, moe);
});

test("mergeKindergartenSources: a missing/invalid kiangFetchedAt fails closed (treated as stale, not fresh)", () => {
  const moe = [moeRecord()];
  const kiang = [kiangRecord({ type: "非營利" })];

  assert.deepEqual(mergeKindergartenSources(moe, kiang, undefined), moe);
  assert.deepEqual(mergeKindergartenSources(moe, kiang, null), moe);
  assert.deepEqual(mergeKindergartenSources(moe, kiang, "not-a-date"), moe);
});

test("mergeKindergartenSources: an unrecognized kiang `type` value leaves the MOE record untouched rather than guessing a category", () => {
  const moe = [moeRecord()];
  const kiang = [kiangRecord({ type: "軍公立" })]; // not one of the 3 known values

  const result = mergeKindergartenSources(moe, kiang, FRESH_DATE);

  assert.deepEqual(result[0], moe[0]);
});

test("mergeKindergartenSources: empty-string monthly fee is treated as unknown (null), not coerced to 0", () => {
  const moe = [moeRecord()];
  const kiang = [kiangRecord({ monthly: "" })];

  const result = mergeKindergartenSources(moe, kiang, FRESH_DATE);

  assert.equal(result[0].extra.monthlyFee, null);
});

test("mergeKindergartenSources: returns a new array without mutating the input moeRecords", () => {
  const moe = [moeRecord()];
  const original = JSON.parse(JSON.stringify(moe));
  const kiang = [kiangRecord({ type: "非營利" })];

  mergeKindergartenSources(moe, kiang, FRESH_DATE);

  assert.deepEqual(moe, original);
});

test("deriveKiangCategory: maps the 3 known `type` values, with 私立 split further by an active pre_public contract", () => {
  assert.equal(deriveKiangCategory({ type: "公立" }), "公立");
  assert.equal(deriveKiangCategory({ type: "非營利" }), "非營利");
  assert.equal(deriveKiangCategory({ type: "私立", pre_public: "無" }), "私立");
  assert.equal(deriveKiangCategory({ type: "私立", pre_public: "" }), "私立");
  assert.equal(deriveKiangCategory({ type: "私立", pre_public: "113-115" }), "準公共");
  assert.equal(deriveKiangCategory({ type: "其他" }), null);
  assert.equal(deriveKiangCategory({}), null);
});

test("stripPostalPrefix: removes a leading bracketed postal code, leaves other text untouched", () => {
  assert.equal(stripPostalPrefix("[701]中華東路二段185巷14號"), "中華東路二段185巷14號");
  assert.equal(stripPostalPrefix("中華東路二段185巷14號"), "中華東路二段185巷14號");
  assert.equal(stripPostalPrefix(""), "");
  assert.equal(stripPostalPrefix(null), "");
});
