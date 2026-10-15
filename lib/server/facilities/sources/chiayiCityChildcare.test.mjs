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
  chiayiCityChildcareRawSchema,
  categorizeChiayiCity,
  buildChiayiCityChildcareRecords,
} = await import("./chiayiCityChildcare.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real-shaped sample rows, fetched live 2026-10-15 via a GitHub Actions
// runner (https://github.com/j172/health/actions/runs/38707357085) against
// data.gov.tw dataset 63093 (data.chiayi.gov.tw) — the production host times
// out against this upstream, so the sample was captured from the runner,
// which does reach it; see the module comment in chiayiCityChildcare.ts.

test("chiayiCityChildcareRawSchema (63093): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("嘉義市公私協力及私立托嬰中心 (63093)", chiayiCityChildcareRawSchema, [
      {
        序號: "1",
        機構類型: "私立",
        機構名稱: "戴德森醫療財團法人職工福利委員會附設嘉義市私立嘉基托嬰中心",
        地址: "嘉義市東區保義路20號",
        電話: "(05)2773603",
        負責人: "李世瑜",
        核定收托人數: "50",
        經度: "120.452769",
        緯度: "23.500928",
      },
    ]),
  );
});

test("chiayiCityChildcareRawSchema (63093): throws if 機構名稱 is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("嘉義市公私協力及私立托嬰中心 (63093)", chiayiCityChildcareRawSchema, [
        { 機構類型: "私立", 名稱: "戴德森醫療財團法人職工福利委員會附設嘉義市私立嘉基托嬰中心", 地址: "嘉義市東區保義路20號", 電話: "" },
      ]),
    /field "機構名稱"/,
  );
});

// --- 機構類型 → category ---

test("categorizeChiayiCity: 私立 → 私立", () => {
  assert.equal(categorizeChiayiCity("私立"), "私立");
});

test("categorizeChiayiCity: 公辦民營 → 公辦民營", () => {
  assert.equal(categorizeChiayiCity("公辦民營"), "公辦民營");
});

test("categorizeChiayiCity: an unrecognized 機構類型 fails safe to null rather than mis-tagging", () => {
  assert.equal(categorizeChiayiCity("準公共"), null);
});

// --- record building ---

test("buildChiayiCityChildcareRecords: passes through the dataset's own lat/lng — no geocoding needed", () => {
  const rows = [
    {
      機構類型: "私立",
      機構名稱: "戴德森醫療財團法人職工福利委員會附設嘉義市私立嘉基托嬰中心",
      地址: "嘉義市東區保義路20號",
      電話: "(05)2773603",
      核定收托人數: "50",
      經度: "120.452769",
      緯度: "23.500928",
    },
  ];
  const records = buildChiayiCityChildcareRecords(rows, "2026-10-14");
  assert.equal(records.length, 1);
  assert.equal(records[0].lng, 120.452769);
  assert.equal(records[0].lat, 23.500928);
  assert.equal(records[0].extra.category, "私立");
  assert.equal(records[0].serviceItem, "私立");
  assert.equal(records[0].sourceKey, "chiayi_city_childcare_63093");
});

test("buildChiayiCityChildcareRecords: a 公辦民營 row whose name contains 社區公共托育家園 is still categorized from the 機構類型 column, not the name text", () => {
  const rows = [
    {
      機構類型: "公辦民營",
      機構名稱: "嘉義市東區社區公共托育家園",
      地址: "嘉義市東區林森東路151號(國立嘉義大學林森校區)",
      電話: "(05)2763008",
      核定收托人數: "12",
      經度: "120.459504",
      緯度: "23.487667",
    },
  ];
  const records = buildChiayiCityChildcareRecords(rows, "2026-10-14");
  assert.equal(records[0].extra.category, "公辦民營");
  // normalizeAddress strips the trailing parenthetical annotation.
  assert.equal(records[0].address, "嘉義市東區林森東路151號");
});

test("buildChiayiCityChildcareRecords: collapses a phone number with trailing whitespace", () => {
  // Confirmed live 2026-10-14: row 7's 電話 is "(05)2312667     " (trailing spaces).
  const rows = [
    {
      機構類型: "公辦民營",
      機構名稱: "嘉義市西區公共托嬰中心",
      地址: "嘉義市西區國揚一街20號3樓",
      電話: "(05)2312667     ",
      核定收托人數: "52",
      經度: "120.42795",
      緯度: "23.48712",
    },
  ];
  const records = buildChiayiCityChildcareRecords(rows, "2026-10-14");
  assert.equal(records[0].phone, "(05)2312667");
});

test("buildChiayiCityChildcareRecords: skips a row missing 機構名稱 or 地址", () => {
  const rows = [
    { 機構類型: "私立", 機構名稱: "", 地址: "嘉義市東區某路1號", 電話: "" },
    { 機構類型: "私立", 機構名稱: "某托嬰中心", 地址: "", 電話: "" },
  ];
  const records = buildChiayiCityChildcareRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
