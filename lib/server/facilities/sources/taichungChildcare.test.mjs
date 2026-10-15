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

const { taichungChildcareRawSchema, buildTaichungChildcareRecords } = await import("./taichungChildcare.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real-shaped sample rows, confirmed live 2026-10-14 (dataset 83669's CSV,
// after stripping the doubled UTF-8 BOM and decoding).
const REAL_ROW_1 = {
  性質: "私立",
  資源彙整機關: "臺中市政府",
  準公共化托嬰中心: "是",
  辦理單位: "臺中市私立德蕾莎托嬰中心",
  成立日期: "2001/1/31 上午 12:00:00",
  立案文號: "中市府社婦字第9003號",
  連絡電話: "(04)23605567",
  地址: "臺中市東區東勢里17鄰進化路221巷25號1-3樓",
  行政區: "東區",
  "X坐標": "218777.003",
  "Y坐標": "2671649.703",
  核定收托人數: "20",
  收托人數: "19",
  服務時間: "一~五8:00~18:00",
  收費標準: "19900",
  評鑑結果112年: "",
  評鑑結果113年: "",
  評鑑結果114年: "甲",
  相關網址: "",
  簡介: "",
  服務對象: "",
  負責人: "于○",
};

test("taichungChildcareRawSchema (83669): accepts a real-shaped row", () => {
  assert.doesNotThrow(() => validateImportRows("臺中市公私協力及私立托嬰中心 (83669)", taichungChildcareRawSchema, [REAL_ROW_1]));
});

test("taichungChildcareRawSchema (83669): throws if 地址 is renamed", () => {
  const { 地址, ...rest } = REAL_ROW_1;
  assert.throws(
    () => validateImportRows("臺中市公私協力及私立托嬰中心 (83669)", taichungChildcareRawSchema, [{ ...rest, 地點: 地址 }]),
    /field "地址"/,
  );
});

test("buildTaichungChildcareRecords: converts TWD97 X/Y into a WGS84 lat/lng landing in 臺中市東區", () => {
  const records = buildTaichungChildcareRecords([REAL_ROW_1], "2026-10-14");
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.name, "臺中市私立德蕾莎托嬰中心");
  assert.ok(record.lat !== null && record.lat > 24.1 && record.lat < 24.2, `lat ${record.lat} unexpected`);
  assert.ok(record.lng !== null && record.lng > 120.6 && record.lng < 120.8, `lng ${record.lng} unexpected`);
  assert.equal(record.serviceItem, "私立");
  assert.equal(record.extra.category, "私立");
  assert.equal(record.extra.approvedCapacity, "20");
  assert.equal(record.extra.actualCapacity, "19");
  assert.equal(record.extra.monthlyFee, "19900");
  // Picks the most recent non-empty 評鑑結果 among 112/113/114年.
  assert.equal(record.extra.evaluationResult, "甲(114年)");
  assert.equal(record.sourceKey, "taichung_childcare_83669");
});

test("buildTaichungChildcareRecords: 性質＝公設民營 maps to the shared 公辦民營 category bucket", () => {
  const row = { ...REAL_ROW_1, 性質: "公設民營", 辦理單位: "臺中市公設民營東區大智國小托嬰中心" };
  const records = buildTaichungChildcareRecords([row], "2026-10-14");
  assert.equal(records[0].serviceItem, "公辦民營");
  assert.equal(records[0].extra.category, "公辦民營");
});

test("buildTaichungChildcareRecords: falls back to an older year's 評鑑結果 when the newest year is blank", () => {
  const row = { ...REAL_ROW_1, 評鑑結果112年: "甲", 評鑑結果113年: "", 評鑑結果114年: "" };
  const records = buildTaichungChildcareRecords([row], "2026-10-14");
  assert.equal(records[0].extra.evaluationResult, "甲(112年)");
});

test("buildTaichungChildcareRecords: no evaluation result at all when all three years are blank", () => {
  const row = { ...REAL_ROW_1, 評鑑結果112年: "", 評鑑結果113年: "", 評鑑結果114年: "" };
  const records = buildTaichungChildcareRecords([row], "2026-10-14");
  assert.equal(records[0].extra.evaluationResult, null);
});

test("buildTaichungChildcareRecords: an unconvertible (NaN) coordinate pair leaves lat/lng null instead of throwing", () => {
  const row = { ...REAL_ROW_1, "X坐標": "", "Y坐標": "" };
  const records = buildTaichungChildcareRecords([row], "2026-10-14");
  assert.equal(records[0].lat, null);
  assert.equal(records[0].lng, null);
});
