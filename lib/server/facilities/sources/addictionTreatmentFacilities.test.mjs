import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

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
        if (existsSyncSafe(candidate)) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

function existsSyncSafe(url) {
  try {
    return fs.existsSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

const {
  addictionTreatmentRawSchema,
  buildAddictionTreatmentSourceId,
  stripAddressAnnotation,
  withCountyPrefix,
  ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE,
} = await import("./addictionTreatmentFacilities.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseCsv, normalizeAddress } = await import("../csv.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/addiction-treatment-133353-sample.csv",
);

function loadFixtureRows() {
  const text = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return parseCsv(text);
}

test("real fixture (133353 sample): parses the real CSV header/field mapping", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 5);
  assert.deepEqual(Object.keys(rows[0]), [
    "序號",
    "縣市別",
    "機構數",
    "各縣市序號",
    "機構名稱",
    "電話",
    "地址",
    "戒治機構模式",
    "戒治服務內容",
  ]);
  assert.equal(rows[0]["機構名稱"], "臺北市立聯合醫院(松德院區)");
  assert.equal(rows[0]["地址"], "臺北市信義區松德路309號");
  assert.equal(rows[0]["戒治機構模式"], "藥癮戒治核心醫院");
  assert.equal(rows[0]["戒治服務內容"], "美沙冬/丁基原啡因");
});

test("real fixture: tolerates a legitimately blank 戒治服務內容 (non-opioid-subsidy rows don't all have one)", () => {
  const rows = loadFixtureRows();
  const row3 = rows.find((r) => r["序號"] === "3");
  assert.equal(row3["戒治服務內容"], "");
  assert.doesNotThrow(() => validateImportRows("Addiction-treatment facilities (133353)", addictionTreatmentRawSchema, rows));
});

test("stripAddressAnnotation: drops a free-text annotation before the last colon (confirmed live on 6/216 real rows)", () => {
  assert.equal(
    stripAddressAnnotation("替代治療執行地點:新北市土城區青雲路6號"),
    "新北市土城區青雲路6號",
  );
  assert.equal(
    stripAddressAnnotation("本院(無提供替代治療)：基隆市安樂區麥金路222號"),
    "基隆市安樂區麥金路222號",
  );
});

test("stripAddressAnnotation: leaves a normal address with no colon untouched", () => {
  assert.equal(stripAddressAnnotation("臺北市信義區松德路309號"), "臺北市信義區松德路309號");
});

test("stripAddressAnnotation: doesn't blank out an address when the colon is the very last character", () => {
  assert.equal(stripAddressAnnotation("某標註："), "某標註：");
});

test("withCountyPrefix: prepends the county when the address starts straight at the 鄉鎮市區 level (序號115 live case)", () => {
  assert.equal(withCountyPrefix("南投縣", "竹山鎮雲林里公所路126號"), "南投縣竹山鎮雲林里公所路126號");
});

test("withCountyPrefix: leaves the address untouched when it already starts with the county (official or informal 臺/台)", () => {
  assert.equal(withCountyPrefix("臺北市", "臺北市信義區松德路309號"), "臺北市信義區松德路309號");
  assert.equal(withCountyPrefix("臺北市", "台北市信義區松德路309號"), "台北市信義區松德路309號");
});

test("withCountyPrefix: doesn't double-prepend when county is empty (unmapped 縣市別 code)", () => {
  assert.equal(withCountyPrefix("", "某路1號"), "某路1號");
});

test("full address pipeline on the 6 anomalous real rows (colon annotations + missing-prefix): resolves to a county-prefixed, annotation-free address", () => {
  const cases = [
    ["65000", "替代治療執行地點:新北市土城區青雲路6號", "新北市土城區青雲路6號"],
    ["10008", "竹山鎮雲林里公所路126號", "南投縣竹山鎮雲林里公所路126號"],
  ];
  for (const [code, rawAddress, expected] of cases) {
    const county = ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE[code];
    const deAnnotated = stripAddressAnnotation(normalizeAddress(rawAddress));
    const result = normalizeAddress(withCountyPrefix(county, deAnnotated));
    assert.equal(result, expected);
  }
});

test("ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE: covers all 22 county codes confirmed live 2026-10-14", () => {
  const codes = Object.keys(ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE);
  assert.equal(codes.length, 22);
  assert.equal(ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE["63000"], "臺北市");
  assert.equal(ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE["9007"], "金門縣");
  assert.equal(ADDICTION_TREATMENT_COUNTY_NAME_BY_CODE["9020"], "連江縣");
});

test("buildAddictionTreatmentSourceId: produces a stable compound key {name}|{address}", () => {
  const sourceId = buildAddictionTreatmentSourceId("臺北市立聯合醫院(松德院區)", "臺北市信義區松德路309號");
  assert.equal(sourceId, "臺北市立聯合醫院(松德院區)|臺北市信義區松德路309號");
});

test("buildAddictionTreatmentSourceId: handles a null/empty address gracefully", () => {
  assert.equal(buildAddictionTreatmentSourceId("某醫院", null), "某醫院|");
  assert.equal(buildAddictionTreatmentSourceId("某醫院", undefined), "某醫院|");
  assert.equal(buildAddictionTreatmentSourceId("某醫院", ""), "某醫院|");
});

test("buildAddictionTreatmentSourceId: trims whitespace and enforces the 100-character cap", () => {
  const longName = "A".repeat(80);
  const longAddress = "B".repeat(80);
  const sourceId = buildAddictionTreatmentSourceId(`  ${longName}  `, `  ${longAddress}  `);
  assert.ok(sourceId.length <= 100);
  assert.equal(sourceId, `${longName}|${"B".repeat(19)}`);
});

test("addictionTreatmentRawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("Addiction-treatment facilities (133353)", addictionTreatmentRawSchema, [
      {
        縣市別: "63000",
        機構名稱: "臺北市立聯合醫院(松德院區)",
        電話: "(02)27263141",
        地址: "臺北市信義區松德路309號",
        戒治機構模式: "藥癮戒治核心醫院",
        戒治服務內容: "美沙冬/丁基原啡因",
      },
    ]),
  );
});

test("addictionTreatmentRawSchema: throws if 機構名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("Addiction-treatment facilities (133353)", addictionTreatmentRawSchema, [
        { 縣市別: "63000", 機構名稱2: "臺北市立聯合醫院", 地址: "臺北市信義區松德路309號", 戒治機構模式: "藥癮戒治核心醫院", 戒治服務內容: "" },
      ]),
    /field "機構名稱"/,
  );
});

test("addictionTreatmentRawSchema: throws if 戒治機構模式 is renamed/removed upstream (the field the 成癮防治分頁 displays)", () => {
  assert.throws(
    () =>
      validateImportRows("Addiction-treatment facilities (133353)", addictionTreatmentRawSchema, [
        { 縣市別: "63000", 機構名稱: "臺北市立聯合醫院", 地址: "臺北市信義區松德路309號", 戒治服務內容: "" },
      ]),
    /field "戒治機構模式"/,
  );
});
