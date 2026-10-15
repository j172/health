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
  earlyInterventionRawSchema,
  buildEarlyInterventionSourceId,
  cleanEarlyInterventionAddress,
  withCountyDistrictPrefix,
} = await import("./earlyInterventionUnits.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseOdsFirstSheet } = await import("../ods.ts");

const FIXTURE_PATH = path.join(fileURLToPath(REPO_ROOT), "lib/server/facilities/__fixtures__/early-intervention-130229-sample.ods");

function loadFixtureRows() {
  const buffer = fs.readFileSync(FIXTURE_PATH);
  return parseOdsFirstSheet(buffer);
}

test("real fixture (130229 sample): parses the real header/field mapping", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 5);
  assert.deepEqual(Object.keys(rows[0]), ["縣市", "鄉鎮市區", "單位別", "服務方式", "單位名稱", "地址", "連絡電話", "療育服務內容", "服務時間"]);
  assert.equal(rows[0]["單位名稱"], "中英醫療社團法人板英醫院");
  assert.equal(rows[0]["地址"], "新北市板橋區文化路1段269號");
});

test("real fixture: schema validation passes on real rows, including a legitimately blank 療育服務內容", () => {
  const rows = loadFixtureRows();
  assert.equal(rows[1]["療育服務內容"], "");
  assert.doesNotThrow(() => validateImportRows("Early-intervention units (130229)", earlyInterventionRawSchema, rows));
});

test("withCountyDistrictPrefix: leaves an address that already starts with the county (official or informal 臺/台) untouched", () => {
  assert.equal(withCountyDistrictPrefix("新北市", "板橋區", "新北市板橋區文化路1段269號"), "新北市板橋區文化路1段269號");
  assert.equal(withCountyDistrictPrefix("臺北市", "北投區", "台北市北投區石牌路二段115號"), "台北市北投區石牌路二段115號");
});

test("withCountyDistrictPrefix: prepends county+district when the address starts straight at the street level (confirmed live, 13/1339 real rows — e.g. 彰化市天祥路53號 under 彰化縣)", () => {
  assert.equal(withCountyDistrictPrefix("彰化縣", "彰化市", "彰化市天祥路53號"), "彰化縣彰化市天祥路53號");
});

test("cleanEarlyInterventionAddress: treats the 3 confirmed-live literal 'no fixed location' placeholder values as null (到宅-only services, not a data bug)", () => {
  assert.equal(cleanEarlyInterventionAddress("新北市", "瑞芳區", "無"), null);
  assert.equal(cleanEarlyInterventionAddress("臺中市", "北屯區", "未設置據點"), null);
  assert.equal(cleanEarlyInterventionAddress("臺南市", "仁德區", "無服務據點"), null);
});

test("cleanEarlyInterventionAddress: null/empty raw address returns null", () => {
  assert.equal(cleanEarlyInterventionAddress("新北市", "板橋區", null), null);
  assert.equal(cleanEarlyInterventionAddress("新北市", "板橋區", ""), null);
});

test("cleanEarlyInterventionAddress: takes only the first of a numbered, ；-separated multi-location list (confirmed live, ~190/1339 real rows)", () => {
  const raw = "1.新北市三芝區中山路1段12號(新北市三芝區衛生所)；2.新北市三芝區育英街22號(三芝國小)";
  assert.equal(cleanEarlyInterventionAddress("新北市", "三芝區", raw), "新北市三芝區中山路1段12號");
});

test("cleanEarlyInterventionAddress: a normal single-location address passes through normalizeAddress unchanged in shape", () => {
  assert.equal(
    cleanEarlyInterventionAddress("新北市", "板橋區", "新北市板橋區文化路1段269號"),
    "新北市板橋區文化路1段269號",
  );
});

test("buildEarlyInterventionSourceId: built from 縣市 + normalized name + address, never a dataset ID", () => {
  const id = buildEarlyInterventionSourceId("新北市", "中英醫療社團法人板英醫院", "新北市板橋區文化路1段269號");
  assert.equal(id, "新北市|中英醫療社團法人板英醫院|新北市板橋區文化路1段269號");
  assert.ok(!id.includes("130229"));
});

test("buildEarlyInterventionSourceId: normalizes an embedded-line-break name (same identity key regardless of upstream line wrapping)", () => {
  const withBreak = buildEarlyInterventionSourceId("新北市", "國泰醫療財團法人\n汐止國泰綜合醫院", "新北市汐止區建成路59巷2號");
  const withoutBreak = buildEarlyInterventionSourceId("新北市", "國泰醫療財團法人汐止國泰綜合醫院", "新北市汐止區建成路59巷2號");
  assert.equal(withBreak, withoutBreak);
});

test("buildEarlyInterventionSourceId: handles a null address and enforces the 150-character cap", () => {
  assert.equal(buildEarlyInterventionSourceId("新北市", "某單位", null), "新北市|某單位|");
  const longName = "A".repeat(100);
  const longAddress = "B".repeat(100);
  const id = buildEarlyInterventionSourceId("新北市", longName, longAddress);
  assert.ok(id.length <= 150);
});

test("earlyInterventionRawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("Early-intervention units (130229)", earlyInterventionRawSchema, [
      {
        縣市: "新北市",
        鄉鎮市區: "板橋區",
        單位別: "衛生單位",
        服務方式: "時段",
        單位名稱: "中英醫療社團法人板英醫院",
        地址: "新北市板橋區文化路1段269號",
        連絡電話: "02-82513923",
        療育服務內容: "物理、職能、語言",
        服務時間: "週一至週五",
      },
    ]),
  );
});

test("earlyInterventionRawSchema: throws if 單位別 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("Early-intervention units (130229)", earlyInterventionRawSchema, [
        { 縣市: "新北市", 鄉鎮市區: "板橋區", 單位別2: "衛生單位", 服務方式: "時段", 單位名稱: "某單位", 地址: "新北市板橋區某路1號" },
      ]),
    /field "單位別"/,
  );
});

test("earlyInterventionRawSchema: throws if 服務方式 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("Early-intervention units (130229)", earlyInterventionRawSchema, [
        { 縣市: "新北市", 鄉鎮市區: "板橋區", 單位別: "衛生單位", 服務方式2: "時段", 單位名稱: "某單位", 地址: "新北市板橋區某路1號" },
      ]),
    /field "服務方式"/,
  );
});
