import test from "node:test";
import assert from "node:assert/strict";

// issue #678 (Track B B-8): the nursing-institution register (data.gov.tw
// 115950) can only be refreshed by a manual residential-network import, so
// /tools/postpartum-care and the 護理之家 categories of /tools/long-term-care
// must (a) show the 資料日期 of that import and (b) say plainly 「資料暫缺」
// when the source has zero rows — never a generic "附近查無…" that reads like
// "there are none near you". The decisions live in this pure module so both
// states are unit-testable without a DOM (this repo has no component-render
// harness; see tests/social-welfare-centers-603.test.mjs for the convention).

const {
  DATA_STATUS_MISSING_HEADING,
  formatDataDate,
  toFacilityDataStatus,
  parseDataStatusSourceParam,
  isDataStatusActive,
  buildDataStatusNotice,
  isFacilityDataMissing,
} = await import("./facilityDataStatus.ts");

const POSTPARTUM = {
  sourceKey: "nhplatform_115950_postpartum",
  subject: "產後護理之家",
  sourceLabel: "衛福部「全國開業護理機構清冊」（data.gov.tw 115950）",
  sourceUrl: "https://data.gov.tw/dataset/115950",
};

const NURSING_CATEGORIES = {
  sourceKey: "nhplatform_115950_ltc",
  subject: "一般護理之家與居家護理所",
  sourceLabel: "衛福部「全國開業護理機構清冊」（data.gov.tw 115950）",
  sourceUrl: "https://data.gov.tw/dataset/115950",
  onlyForCategories: ["一般護理之家", "居家護理所"],
  partialNote: "目前列出的結果（若有）只來自長照地理資訊系統的住宿型機構，並不完整。",
};

// --- formatDataDate ---------------------------------------------------------

test("formatDataDate: a UTC instant late on the 15th is the 16th in Taiwan (the import date people actually saw)", () => {
  assert.equal(formatDataDate(new Date("2026-10-15T17:30:00.000Z")), "2026-10-16");
  assert.equal(formatDataDate(new Date("2026-10-15T15:59:59.000Z")), "2026-10-15");
});

test("formatDataDate: accepts an ISO string or a plain YYYY-MM-DD and rejects garbage", () => {
  assert.equal(formatDataDate("2026-10-15T17:30:00.000Z"), "2026-10-16");
  assert.equal(formatDataDate("2026-10-16"), "2026-10-16");
  assert.equal(formatDataDate(""), null);
  assert.equal(formatDataDate("not a date"), null);
  assert.equal(formatDataDate(null), null);
  assert.equal(formatDataDate(undefined), null);
  assert.equal(formatDataDate(new Date("nope")), null);
});

// --- toFacilityDataStatus (DB row -> wire shape) -----------------------------

test("toFacilityDataStatus: a populated source reports its count and the Taiwan-local import date", () => {
  assert.deepEqual(toFacilityDataStatus(241, new Date("2026-10-15T17:30:00.000Z")), {
    sourceTotal: 241,
    dataDate: "2026-10-16",
  });
  assert.deepEqual(toFacilityDataStatus("1253", new Date("2026-10-15T01:00:00.000Z")), {
    sourceTotal: 1253,
    dataDate: "2026-10-15",
  });
});

test("toFacilityDataStatus: an empty source (MAX(synced_at) is NULL) is zero rows with no date", () => {
  assert.deepEqual(toFacilityDataStatus(0, null), { sourceTotal: 0, dataDate: null });
  assert.deepEqual(toFacilityDataStatus("0", null), { sourceTotal: 0, dataDate: null });
  assert.deepEqual(toFacilityDataStatus(undefined, undefined), { sourceTotal: 0, dataDate: null });
});

test("toFacilityDataStatus: never invents a date for a zero-row source, even if a date is passed", () => {
  assert.deepEqual(toFacilityDataStatus(0, new Date("2026-10-15T01:00:00.000Z")), { sourceTotal: 0, dataDate: null });
});

// --- parseDataStatusSourceParam ----------------------------------------------

test("parseDataStatusSourceParam: accepts a plain source key and nothing else", () => {
  assert.equal(parseDataStatusSourceParam("nhplatform_115950_ltc"), "nhplatform_115950_ltc");
  assert.equal(parseDataStatusSourceParam("  nhplatform_115950_postpartum "), "nhplatform_115950_postpartum");
  assert.equal(parseDataStatusSourceParam(""), null);
  assert.equal(parseDataStatusSourceParam(null), null);
  assert.equal(parseDataStatusSourceParam(undefined), null);
  assert.equal(parseDataStatusSourceParam("a;DROP TABLE facilities"), null);
  assert.equal(parseDataStatusSourceParam("Has-Dash"), null);
  assert.equal(parseDataStatusSourceParam("x".repeat(41)), null, "facilities.source_key is VARCHAR(40)");
  assert.equal(parseDataStatusSourceParam("x".repeat(40)), "x".repeat(40));
});

// --- the "資料暫缺" state --------------------------------------------------------

test("zero rows: the notice is an honest 「資料暫缺」, says why, and does not claim nothing is nearby", () => {
  const notice = buildDataStatusNotice(POSTPARTUM, { sourceTotal: 0, dataDate: null });
  assert.equal(notice.state, "missing");
  assert.equal(notice.heading, "資料暫缺");
  assert.equal(DATA_STATUS_MISSING_HEADING, "資料暫缺");
  assert.match(notice.message, /尚未收錄產後護理之家/);
  assert.match(notice.message, /人工匯入/);
  assert.match(notice.message, /不代表附近沒有產後護理之家/);
  assert.match(notice.message, /衛福部「全國開業護理機構清冊」/);
  assert.equal(notice.sourceUrl, "https://data.gov.tw/dataset/115950");
  assert.doesNotMatch(notice.message, /資料日期/, "no date is claimed when there is no data");
});

test("zero rows: a config with a partialNote appends it (long-term-care still lists other sources' nursing homes)", () => {
  const notice = buildDataStatusNotice(NURSING_CATEGORIES, { sourceTotal: 0, dataDate: null });
  assert.equal(notice.state, "missing");
  assert.match(notice.message, /長照地理資訊系統的住宿型機構，並不完整/);
});

test("isFacilityDataMissing: true only when the status says zero rows", () => {
  assert.equal(isFacilityDataMissing(POSTPARTUM, { sourceTotal: 0, dataDate: null }, ""), true);
  assert.equal(isFacilityDataMissing(POSTPARTUM, { sourceTotal: 241, dataDate: "2026-10-16" }, ""), false);
});

test("an unknown status (API failed, or an older API without dataStatus) never claims the data is missing", () => {
  assert.equal(buildDataStatusNotice(POSTPARTUM, null), null);
  assert.equal(buildDataStatusNotice(POSTPARTUM, undefined), null);
  assert.equal(isFacilityDataMissing(POSTPARTUM, null, ""), false);
  assert.equal(isFacilityDataMissing(POSTPARTUM, undefined, ""), false);
});

// --- the 「資料日期」 state ------------------------------------------------------

test("rows present: the notice shows the 資料日期 and the source, framed as the site's last import", () => {
  const notice = buildDataStatusNotice(POSTPARTUM, { sourceTotal: 241, dataDate: "2026-10-16" });
  assert.equal(notice.state, "available");
  assert.equal(notice.dataDateLabel, "資料日期：2026-10-16");
  assert.match(notice.message, /本站最近一次匯入/);
  assert.match(notice.message, /衛福部「全國開業護理機構清冊」/);
  assert.match(notice.message, /非本站判定/);
  assert.equal(notice.sourceUrl, "https://data.gov.tw/dataset/115950");
});

test("rows present but no usable date: says the date is unknown instead of showing a blank or a made-up one", () => {
  const notice = buildDataStatusNotice(POSTPARTUM, { sourceTotal: 5, dataDate: null });
  assert.equal(notice.state, "available");
  assert.equal(notice.dataDateLabel, "資料日期：不明");
});

// --- category gating (long-term-care) -------------------------------------------

test("isDataStatusActive: a config without onlyForCategories is always active (postpartum-care)", () => {
  assert.equal(isDataStatusActive(POSTPARTUM, ""), true);
  assert.equal(isDataStatusActive(POSTPARTUM, "anything"), true);
});

test("isDataStatusActive: long-term-care only reports on the two nursing-institution categories", () => {
  assert.equal(isDataStatusActive(NURSING_CATEGORIES, ""), false);
  assert.equal(isDataStatusActive(NURSING_CATEGORIES, "居家服務"), false);
  assert.equal(isDataStatusActive(NURSING_CATEGORIES, "一般護理之家"), true);
  assert.equal(isDataStatusActive(NURSING_CATEGORIES, "居家護理所"), true);
});

test("isFacilityDataMissing: an inactive category never reports missing, even with a zero-row status left over from before", () => {
  assert.equal(isFacilityDataMissing(NURSING_CATEGORIES, { sourceTotal: 0, dataDate: null }, "居家服務"), false);
  assert.equal(isFacilityDataMissing(NURSING_CATEGORIES, { sourceTotal: 0, dataDate: null }, "居家護理所"), true);
});

test("no config at all: nothing to report", () => {
  assert.equal(isDataStatusActive(undefined, ""), false);
  assert.equal(isFacilityDataMissing(undefined, { sourceTotal: 0, dataDate: null }, ""), false);
});
