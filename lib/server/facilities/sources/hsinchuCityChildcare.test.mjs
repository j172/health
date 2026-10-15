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

const { hccgChildcareRawSchema, buildHsinchuCityChildcareRecords } = await import("./hsinchuCityChildcare.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real-shaped sample rows, confirmed live 2026-10-14 against data.gov.tw
// dataset 67734 (odws.hccg.gov.tw).

test("hccgChildcareRawSchema (67734): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("新竹市公私立托嬰中心名冊 (67734)", hccgChildcareRawSchema, [
      {
        中心名稱: "新竹市私立卡爾威特托嬰中心",
        負責人: "黃瑞發",
        住址: "新竹市東區建功一路59巷12號1樓",
        電話01: "(03)5749777",
        核准文號: "1. 93.05.03府社婦字第0930053889號",
      },
    ]),
  );
});

test("hccgChildcareRawSchema (67734): throws if 住址 is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("新竹市公私立托嬰中心名冊 (67734)", hccgChildcareRawSchema, [
        { 中心名稱: "新竹市私立卡爾威特托嬰中心", 負責人: "黃瑞發", 地址: "新竹市東區建功一路59巷12號1樓", 電話01: "" },
      ]),
    /field "住址"/,
  );
});

test("buildHsinchuCityChildcareRecords: fixes the 巿→市 typo in the address before normalizing", () => {
  // Confirmed live 2026-10-14: 1 of 80 rows has "新竹巿" (U+5DFF, an archaic
  // variant) instead of "新竹市" (U+5E02).
  const rows = [
    {
      中心名稱: "新竹市私立國際音樂托嬰中心北區民富校",
      住址: "新竹巿北區民富街256號1樓",
      電話01: "(03)5221672",
    },
  ];
  const records = buildHsinchuCityChildcareRecords(rows, "2026-10-14");
  assert.equal(records.length, 1);
  assert.equal(records[0].address, "新竹市北區民富街256號1樓");
  assert.ok(!records[0].address.includes("巿"));
});

test("buildHsinchuCityChildcareRecords: leaves category/serviceItem null — this roster has no type column", () => {
  const rows = [{ 中心名稱: "新竹市私立傑尼爾托嬰中心", 住址: "新竹市香山區香北路252號", 電話01: "(03)5382223" }];
  const records = buildHsinchuCityChildcareRecords(rows, "2026-10-14");
  assert.equal(records[0].serviceItem, null);
  assert.equal(records[0].extra.category, undefined);
  assert.equal(records[0].sourceKey, "hccg_childcare_67734");
});

test("buildHsinchuCityChildcareRecords: skips a row missing 中心名稱 or 住址", () => {
  const rows = [
    { 中心名稱: "", 住址: "新竹市北區某路1號", 電話01: "" },
    { 中心名稱: "某托嬰中心", 住址: "", 電話01: "" },
  ];
  const records = buildHsinchuCityChildcareRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
