import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
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

const {
  hsinchuCountyChildcareRawSchema,
  categorizeHsinchuCounty,
  buildHsinchuCountyChildcareRecords,
} = await import("./hsinchuCountyChildcare.ts");
const { decodeBig5 } = await import("../csv.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real-shaped sample rows, confirmed live 2026-10-14 against data.gov.tw
// dataset 109321 (ws.hsinchu.gov.tw).

test("hsinchuCountyChildcareRawSchema (109321): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("新竹縣立案托嬰中心名冊 (109321)", hsinchuCountyChildcareRawSchema, [
      {
        編號: "1",
        設立別: "私立",
        機構名稱: "新竹縣私立庫奇托嬰中心",
        郵遞區號: "302",
        地址: "新竹縣竹北市中山路257號",
        核准托嬰人數: "15",
        負責人: "彭鈺梅",
        電話: "(03)5558088",
        加入準公共化: "已加入",
        核准收費項目金額單位_新臺幣: "20,790/月(含餐費)註冊費:36,000/半年月費:13,290/月餐點費:1,500/月",
      },
    ]),
  );
});

test("hsinchuCountyChildcareRawSchema (109321): throws if 機構名稱 is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("新竹縣立案托嬰中心名冊 (109321)", hsinchuCountyChildcareRawSchema, [
        { 設立別: "私立", 名稱: "新竹縣私立庫奇托嬰中心", 地址: "新竹縣竹北市中山路257號", 電話: "" },
      ]),
    /field "機構名稱"/,
  );
});

// --- cp950/Big5 decoding ---

test("decodeBig5: a real cp950-labelled byte sample from this dataset decodes to correct Chinese text", () => {
  // Byte sequence for the first institution name in the live 109321 CSV
  // ("新竹縣私立庫奇托嬰中心") as it actually appears cp950/Big5-encoded on
  // the wire (confirmed live 2026-10-14; issue #607's AC explicitly calls
  // for a cp950 decode test case) — this is the exact regression a decoder
  // mismatch (e.g. falling back to UTF-8 or Latin-1) would produce mojibake
  // or U+FFFD for.
  const text = "新竹縣私立庫奇托嬰中心";
  const big5Bytes = Buffer.from([
    0xb7, 0x73, 0xa6, 0xcb, 0xbf, 0xa4, 0xa8, 0x70, 0xa5, 0xdf, 0xae, 0x77, 0xa9, 0x5f, 0xa6, 0xab, 0xc0, 0xa6,
    0xa4, 0xa4, 0xa4, 0xdf,
  ]);
  const decoded = decodeBig5(big5Bytes);
  assert.equal(decoded, text);
  assert.ok(!decoded.includes("�"), "must not contain the U+FFFD replacement character");
});

// --- 設立別 × 加入準公共化 → category ---

test("categorizeHsinchuCounty: 公托家園 → 社區公共托育家園", () => {
  assert.equal(categorizeHsinchuCounty("公托家園", "(公共化)"), "社區公共托育家園");
});

test("categorizeHsinchuCounty: 公設民營 → 公辦民營", () => {
  assert.equal(categorizeHsinchuCounty("公設民營", "(公共化)"), "公辦民營");
});

test("categorizeHsinchuCounty: 私立 + 已加入 → 準公共", () => {
  assert.equal(categorizeHsinchuCounty("私立", "已加入"), "準公共");
});

test("categorizeHsinchuCounty: 私立 + blank → 私立", () => {
  assert.equal(categorizeHsinchuCounty("私立", ""), "私立");
});

test("categorizeHsinchuCounty: an unrecognized 設立別 fails safe to null rather than mis-tagging", () => {
  assert.equal(categorizeHsinchuCounty("其他", "已加入"), null);
});

// --- record building, including the fee-info field this county's ticket AC calls out ---

test("buildHsinchuCountyChildcareRecords: carries the free-text fee composite into extra.monthlyFee as-is", () => {
  const rows = [
    {
      設立別: "私立",
      機構名稱: "新竹縣私立庫奇托嬰中心",
      地址: "新竹縣竹北市中山路257號",
      核准托嬰人數: "15",
      電話: "(03)5558088",
      加入準公共化: "已加入",
      核准收費項目金額單位_新臺幣: "20,790/月(含餐費)註冊費:36,000/半年月費:13,290/月餐點費:1,500/月",
    },
  ];
  const records = buildHsinchuCountyChildcareRecords(rows, "2026-10-14");
  assert.equal(records.length, 1);
  assert.equal(records[0].extra.monthlyFee, "20,790/月(含餐費)註冊費:36,000/半年月費:13,290/月餐點費:1,500/月");
  assert.equal(records[0].extra.category, "準公共");
  assert.equal(records[0].serviceItem, "準公共");
  assert.equal(records[0].extra.approvedCapacity, "15");
  assert.equal(records[0].sourceKey, "hsinchu_county_childcare_109321");
});

test("buildHsinchuCountyChildcareRecords: 公托家園 row classified 社區公共托育家園, no address prefix needed", () => {
  const rows = [
    {
      設立別: "公托家園",
      機構名稱: "新竹縣政府社區公共托育家園",
      地址: "新竹縣竹北市光明六路10號B棟1樓",
      核准托嬰人數: "12",
      電話: "(03)5586905",
      加入準公共化: "(公共化)",
      核准收費項目金額單位_新臺幣: "13,000/月",
    },
  ];
  const records = buildHsinchuCountyChildcareRecords(rows, "2026-10-14");
  assert.equal(records[0].extra.category, "社區公共托育家園");
  assert.equal(records[0].address, "新竹縣竹北市光明六路10號B棟1樓");
});

test("buildHsinchuCountyChildcareRecords: skips a row missing 機構名稱 or 地址", () => {
  const rows = [
    { 設立別: "私立", 機構名稱: "", 地址: "新竹縣竹北市某路1號", 加入準公共化: "" },
    { 設立別: "私立", 機構名稱: "某托嬰中心", 地址: "", 加入準公共化: "" },
  ];
  const records = buildHsinchuCountyChildcareRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
