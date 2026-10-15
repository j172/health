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
  taipeiPrivateRawSchema,
  taipeiPublicPrivateRawSchema,
  taipeiQuasiRawSchema,
  taipeiCommunityOrHomeRawSchema,
  buildTaipeiPrivateRecords,
} = await import("./taipeiChildcare.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// --- raw schema validation (real-shaped sample rows, confirmed live 2026-10-14) ---

test("taipeiPrivateRawSchema (121278): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("臺北市私立托嬰中心 (121278)", taipeiPrivateRawSchema, [
      {
        機構類型: "私立托嬰中心",
        機構名稱: "臺北市私立怡寶優質托嬰中心",
        郵遞區號: "111044",
        地址: "臺北市士林區文林路740巷9弄24號1樓",
        電話: "(02)28358158",
      },
    ]),
  );
});

test("taipeiPrivateRawSchema (121278): throws if 機構名稱 is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("臺北市私立托嬰中心 (121278)", taipeiPrivateRawSchema, [
        { 機構類型: "私立托嬰中心", 名稱: "臺北市私立怡寶優質托嬰中心", 地址: "臺北市士林區文林路740巷9弄24號1樓", 電話: "" },
      ]),
    /field "機構名稱"/,
  );
});

test("taipeiPublicPrivateRawSchema (121337): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("臺北市公辦民營托嬰中心 (121337)", taipeiPublicPrivateRawSchema, [
      { 機構類型: "公辦民營托嬰中心", 機構名稱: "臺北市士林托嬰中心", 收托人數: "48", 地址: "臺北市士林區基河路130號", 電話: "(02)28836242" },
    ]),
  );
});

test("taipeiPublicPrivateRawSchema (121337): throws if 收托人數 is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("臺北市公辦民營托嬰中心 (121337)", taipeiPublicPrivateRawSchema, [
        { 機構類型: "公辦民營托嬰中心", 機構名稱: "臺北市士林托嬰中心", 收托數: "48", 地址: "臺北市士林區基河路130號", 電話: "" },
      ]),
    /field "收托人數"/,
  );
});

test("taipeiQuasiRawSchema (121981): accepts a real-shaped row, including a blank 評鑑結果 (data quality, not a schema change)", () => {
  assert.doesNotThrow(() =>
    validateImportRows("臺北市準公共托嬰中心 (121981)", taipeiQuasiRawSchema, [
      {
        序號: "8",
        機構名稱: "臺北市私立樂寶托嬰中心",
        行政區: "中正區",
        地址: "臺北市中正區林森南路101號及101號之一1樓",
        電話: "(02)23581556",
        核定收托人數: "35",
        實際收托人數: "18",
        評鑑結果: "",
      },
    ]),
  );
});

test("taipeiQuasiRawSchema (121981): throws if 核定收托人數 is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("臺北市準公共托嬰中心 (121981)", taipeiQuasiRawSchema, [
        {
          序號: "1",
          機構名稱: "臺北市私立小哈利托嬰中心",
          行政區: "中正區",
          地址: "臺北市中正區南昌路1段145號2樓",
          電話: "(02)33933104",
          核定人數: "32",
          實際收托人數: "32",
          評鑑結果: "109-甲",
        },
      ]),
    /field "核定收托人數"/,
  );
});

test("taipeiCommunityOrHomeRawSchema (126984/126986): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("臺北市社區公共托育家園 (126984)", taipeiCommunityOrHomeRawSchema, [
      { 序號: "1", 機構類型: "社區公共托育家園", 機構名稱: "臺北市芝山社區公共托育家園", 地址: "臺北市士林區德行東路285號3樓(芝山國小忠孝樓)", 電話: "(02)28385506" },
    ]),
  );
});

test("taipeiCommunityOrHomeRawSchema (126984/126986): throws if 地址 is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("臺北市居家托育服務中心 (126986)", taipeiCommunityOrHomeRawSchema, [
        { 序號: "1", 機構類型: "居家托育服務中心", 機構名稱: "臺北市大同區居家托育服務中心", 地點: "臺北市大同區承德路2段33號7樓之1", 電話: "(02)25981828" },
      ]),
    /field "地址"/,
  );
});

// --- the Taipei 私立/準公共 dedupe scenario (issue #601's hardest requirement) ---

test("buildTaipeiPrivateRecords: an institution listed in both 私立 and 準公共 produces zero rows from the 私立 builder (準公共 wins)", () => {
  const privateRows = [
    { 機構類型: "私立托嬰中心", 機構名稱: "臺北市私立小哈利托嬰中心", 郵遞區號: "100", 地址: "臺北市中正區南昌路1段145號2樓", 電話: "(02)33933104" },
  ];
  const quasiRows = [
    {
      序號: "1",
      機構名稱: "臺北市私立小哈利托嬰中心",
      行政區: "中正區",
      地址: "臺北市中正區南昌路1段145號2樓",
      電話: "(02)33933104",
      核定收托人數: "32",
      實際收托人數: "32",
      評鑑結果: "109-甲",
    },
  ];

  const records = buildTaipeiPrivateRecords(privateRows, quasiRows, "2026-10-14");
  assert.equal(records.length, 0, "the overlapping institution must not be emitted a second time by the 私立 builder");
});

test("buildTaipeiPrivateRecords: still dedupes when 準公共's address omits a trailing floor the 私立 table keeps", () => {
  // Confirmed live 2026-10-14: 11 of the 215 準公共 rows match a 私立 row on
  // name but the 準公共 table's address is missing the floor the 私立 table
  // keeps (e.g. "...145號" vs "...145號2樓"). Both must still collapse to one
  // institution (classified 準公共, handled by the quasi builder — not shown
  // here), so the 私立 builder must suppress it too.
  const privateRows = [
    { 機構類型: "私立托嬰中心", 機構名稱: "臺北市私立晴晴托嬰中心", 郵遞區號: "100", 地址: "臺北市師大路176號1樓", 電話: "(02)23675580" },
  ];
  const quasiRows = [
    {
      序號: "6",
      機構名稱: "臺北市私立晴晴托嬰中心",
      行政區: "中正區",
      地址: "臺北市師大路176號", // no floor suffix, unlike the 私立 row above
      電話: "(02)23675580",
      核定收托人數: "33",
      實際收托人數: "33",
      評鑑結果: "110-甲",
    },
  ];

  const records = buildTaipeiPrivateRecords(privateRows, quasiRows, "2026-10-14");
  assert.equal(records.length, 0);
});

test("buildTaipeiPrivateRecords: an institution only in the 私立 table (no 準公共 match) is still emitted, classified 私立", () => {
  const privateRows = [
    { 機構類型: "私立托嬰中心", 機構名稱: "臺北市私立怡寶優質托嬰中心", 郵遞區號: "111044", 地址: "臺北市士林區文林路740巷9弄24號1樓", 電話: "(02)28358158" },
  ];
  const quasiRows = []; // no overlap at all

  const records = buildTaipeiPrivateRecords(privateRows, quasiRows, "2026-10-14");
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "臺北市私立怡寶優質托嬰中心");
  assert.equal(records[0].serviceItem, "私立");
  assert.equal(records[0].extra.category, "私立");
  assert.equal(records[0].sourceKey, "taipei_childcare_121278");
});

test("buildTaipeiPrivateRecords: does NOT merge a name match whose address genuinely differs (distinct house number)", () => {
  // Confirmed live 2026-10-14: one 準公共 row shares a name with a 私立 row
  // but the house numbers themselves differ ("...227號" vs "...191號") — a
  // likely upstream data error on one side, not a real duplicate. Merging it
  // would risk silently discarding a real, distinct address.
  const privateRows = [
    { 機構類型: "私立托嬰中心", 機構名稱: "臺北市私立某某托嬰中心", 郵遞區號: "112", 地址: "臺北市北投區中央北路2段191號1樓", 電話: "(02)28211271" },
  ];
  const quasiRows = [
    {
      序號: "9",
      機構名稱: "臺北市私立某某托嬰中心",
      行政區: "北投區",
      地址: "臺北市北投區中央北路2段227號1樓", // different house number
      電話: "(02)28211271",
      核定收托人數: "20",
      實際收托人數: "20",
      評鑑結果: "111-甲",
    },
  ];

  const records = buildTaipeiPrivateRecords(privateRows, quasiRows, "2026-10-14");
  assert.equal(records.length, 1, "the two rows must NOT be merged — the addresses genuinely differ");
});
