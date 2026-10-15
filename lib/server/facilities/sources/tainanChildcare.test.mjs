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

const { tainanChildcareRawSchema, buildTainanChildcareRecords } = await import("./tainanChildcare.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real-shaped sample rows, confirmed live 2026-10-14 (dataset 6178's CSV
// resource 342fad63-5463-4642-9b19-8611316c5fd1, after stripping the doubled
// UTF-8 BOM).
const REAL_ROW_QUASI = {
  編號: "1",
  區別: "中西區",
  中心名稱: "幼寶托嬰中心",
  負責人姓名: "顏姜金葉",
  地址: "臺南市中西區南寧街22號1樓",
  電話: "(06)2148835",
  立案日期: "20080115",
  核准收托人數: "18",
  "截至10/14實際收托人數": "14",
  "每學期註冊/教材費": "0",
  月費: "18800",
  每月副食品費: "1000",
  準公共化單位: "是",
  平均月費: "18800",
};

const REAL_ROW_PRIVATE = {
  編號: "2",
  區別: "中西區",
  中心名稱: "朝陽托嬰中心",
  負責人姓名: "",
  地址: "臺南市中西區民族路三段253號1-2樓",
  電話: "(06)2267287",
  立案日期: "20231228",
  核准收托人數: "21",
  "截至10/14實際收托人數": "19",
  "每學期註冊/教材費": "13800",
  月費: "16000",
  每月副食品費: "2000",
  準公共化單位: "否",
  平均月費: "",
};

test("tainanChildcareRawSchema (6178): accepts a real-shaped row", () => {
  assert.doesNotThrow(() => validateImportRows("臺南市私立托嬰中心名冊暨收費標準一覽表 (6178)", tainanChildcareRawSchema, [REAL_ROW_QUASI]));
});

test("tainanChildcareRawSchema (6178): throws if 中心名稱 is renamed", () => {
  const { 中心名稱, ...rest } = REAL_ROW_QUASI;
  assert.throws(
    () => validateImportRows("臺南市私立托嬰中心名冊暨收費標準一覽表 (6178)", tainanChildcareRawSchema, [{ ...rest, 機構名稱: 中心名稱 }]),
    /field "中心名稱"/,
  );
});

test("buildTainanChildcareRecords: 準公共化單位＝是 classifies the row as 準公共 and surfaces registrationFee/monthlyFee/mealFee", () => {
  const records = buildTainanChildcareRecords([REAL_ROW_QUASI], "2026-10-14");
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.name, "幼寶托嬰中心");
  assert.equal(record.serviceItem, "準公共");
  assert.equal(record.extra.category, "準公共");
  assert.equal(record.extra.approvedCapacity, "18");
  assert.equal(record.extra.actualCapacity, "14");
  assert.equal(record.extra.registrationFee, "0");
  assert.equal(record.extra.monthlyFee, "18800");
  assert.equal(record.extra.mealFee, "1000");
  assert.equal(record.sourceKey, "tainan_childcare_6178");
});

test("buildTainanChildcareRecords: 準公共化單位＝否 classifies the row as 私立", () => {
  const records = buildTainanChildcareRecords([REAL_ROW_PRIVATE], "2026-10-14");
  assert.equal(records[0].serviceItem, "私立");
  assert.equal(records[0].extra.category, "私立");
  assert.equal(records[0].extra.registrationFee, "13800");
});

test("buildTainanChildcareRecords: an empty 每月副食品費 value becomes null, not an empty string", () => {
  const records = buildTainanChildcareRecords([{ ...REAL_ROW_PRIVATE, 每月副食品費: "" }], "2026-10-14");
  assert.equal(records[0].extra.mealFee, null);
});

test("buildTainanChildcareRecords: rows missing 中心名稱 or 地址 are skipped", () => {
  const records = buildTainanChildcareRecords([{ ...REAL_ROW_QUASI, 中心名稱: "" }], "2026-10-14");
  assert.equal(records.length, 0);
});
