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

const { tycgNormalizedRowSchema, normalizeTycgRow, buildTycgPublicPrivateRecords } = await import("./tycgChildcare.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// --- normalizeTycgRow: tolerant of the year-stamped/whitespace-inconsistent
// headers both 168379 and 168385 ship (confirmed live 2026-10-14) ---

test("normalizeTycgRow (168379-shaped): extracts stable fields from a raw row whose 是否加入準公共化服務合作 header carries this year's contract-expiry date", () => {
  const raw = {
    序號: "1",
    機構類別: "私立",
    區域: "桃園市八德區",
    機構名稱: "桃園市私立喜美斯希望托嬰中心",
    "是否加入準公共化服務合作\n(契約效期至114.12.31)": "是",
    最近ㄧ次評鑑結果: "甲(111)",
    "平均月費(元)": "20790\n(113年8月新生適用)",
    負責人: "徐美蓉",
    設立日期: "101.10.23",
    服務對象: "未滿2歲兒童",
    立案樓層: "2樓",
    "機構面積(平方公尺)": "240.42",
    核定床位數: "45",
    法規規定之機構收容人力比: "1:5 (1名托育人員至多照顧5名幼兒)",
    地址: "桃園市八德區大勇里忠勇五街22號2樓",
    聯絡電話: "03-3752726",
  };
  const normalized = normalizeTycgRow(raw);
  assert.deepEqual(normalized, {
    機構類別: "私立",
    機構名稱: "桃園市私立喜美斯希望托嬰中心",
    地址: "桃園市八德區大勇里忠勇五街22號2樓",
    聯絡電話: "03-3752726",
    評鑑結果: "甲(111)",
    // normalizeTycgRow's nonEmpty() collapses internal whitespace (incl. the
    // embedded newline before the parenthetical note) to a single space.
    平均月費: "20790 (113年8月新生適用)",
    核定床位數: "45",
  });
});

test("normalizeTycgRow (168385-shaped): same stable fields come out even though 核定/評鑑/月費 headers have embedded newlines and a different contract-expiry year", () => {
  const raw = {
    序號: "1",
    機構類別: "私立",
    區域: "桃園市八德區",
    機構名稱: "桃園市私立喜美斯希望托嬰中心",
    "是否加入準公共化服務合作\n(契約效期至116.07.31)": "是",
    "最近ㄧ次\n評鑑結果": "甲(114)",
    "平均月費\n(元)": "20,790",
    負責人: "陳妍貞",
    設立日期: "101.10.23",
    立案樓層: "2樓",
    "機構面積\n(平方公尺)": "240.42",
    "核定\n床位數": "45",
    地址: "桃園市八德區大勇里忠勇五街22號2樓",
    聯絡電話: "03-3752726",
  };
  const normalized = normalizeTycgRow(raw);
  assert.equal(normalized.機構名稱, "桃園市私立喜美斯希望托嬰中心");
  assert.equal(normalized.評鑑結果, "甲(114)");
  assert.equal(normalized.平均月費, "20,790");
  assert.equal(normalized.核定床位數, "45");
});

test("tycgNormalizedRowSchema: throws if 機構名稱 is entirely missing from every row (a real rename, not just the yearly date noise)", () => {
  assert.throws(
    () =>
      validateImportRows("桃園市公私立托嬰中心 (168379)", tycgNormalizedRowSchema, [
        { 機構類別: "私立", 機構名稱: undefined, 地址: "桃園市八德區大勇里忠勇五街22號2樓", 聯絡電話: null, 評鑑結果: null, 平均月費: null, 核定床位數: null },
      ]),
    /field "機構名稱"/,
  );
});

// --- the 168379/168385 private/quasi dedupe scenario, same shape as Taipei's ---

test("buildTycgPublicPrivateRecords: an institution listed in both 168379 and 168385 produces zero rows from the 168379 builder (168385 wins)", () => {
  const rawRows = [
    { 機構類別: "私立", 機構名稱: "桃園市私立喜美斯希望托嬰中心", 地址: "桃園市八德區大勇里忠勇五街22號2樓", 聯絡電話: "03-3752726", 評鑑結果: "甲(111)", 平均月費: "20790", 核定床位數: "45" },
  ];
  const quasiRows = [
    { 機構類別: "私立", 機構名稱: "桃園市私立喜美斯希望托嬰中心", 地址: "桃園市八德區大勇里忠勇五街22號2樓", 聯絡電話: "03-3752726", 評鑑結果: "甲(114)", 平均月費: "20,790", 核定床位數: "45" },
  ];

  const records = buildTycgPublicPrivateRecords(rawRows, quasiRows, "2026-10-14");
  assert.equal(records.length, 0, "the overlapping institution must not be emitted a second time by the 168379 builder");
});

test("buildTycgPublicPrivateRecords: an institution only in 168379 (no 168385 match) is still emitted, classified by its own 機構類別", () => {
  const rawRows = [
    { 機構類別: "公設民營", 機構名稱: "桃園市公設民營陽光托嬰中心", 地址: "桃園市桃園區陽明路100號", 聯絡電話: "03-1234567", 評鑑結果: "甲(113)", 平均月費: "18000", 核定床位數: "30" },
  ];
  const quasiRows = []; // no overlap

  const records = buildTycgPublicPrivateRecords(rawRows, quasiRows, "2026-10-14");
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "桃園市公設民營陽光托嬰中心");
  assert.equal(records[0].serviceItem, "公辦民營");
  assert.equal(records[0].extra.category, "公辦民營");
  assert.equal(records[0].extra.approvedCapacity, "30");
  assert.equal(records[0].extra.monthlyFee, "18000");
  assert.equal(records[0].sourceKey, "tycg_childcare_168379");
  // sourceId must never bake in the dataset's year-stamped identity.
  assert.ok(!records[0].sourceId.includes("168379"));
  assert.ok(!records[0].sourceId.includes("114"));
});

test("buildTycgPublicPrivateRecords: 平均月費's trailing annotation is stripped down to the leading digits", () => {
  const rawRows = [
    { 機構類別: "私立", 機構名稱: "桃園市私立測試托嬰中心", 地址: "桃園市中壢區測試路1號", 聯絡電話: "", 評鑑結果: null, 平均月費: "20790\n(113年8月新生適用)", 核定床位數: "45" },
  ];
  const records = buildTycgPublicPrivateRecords(rawRows, [], "2026-10-14");
  assert.equal(records[0].extra.monthlyFee, "20790");
});
