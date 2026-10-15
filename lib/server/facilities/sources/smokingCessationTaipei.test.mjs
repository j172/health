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
  smokingCessationTaipeiRawSchema,
  buildSmokingCessationTaipeiRecords,
  SMOKING_CESSATION_TAIPEI_SOURCE_KEY,
} = await import("./smokingCessationTaipei.ts");
const { decodeBig5, parseCsv } = await import("../csv.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/smoking-cessation-taipei-121898-sample.csv",
);

// Real Big5-encoded bytes saved 2026-10-14 from a fresh download of
// https://data.taipei/api/dataset/4c241d88-c448-4b48-96ce-14865d97807d/resource/
// e8df6a1e-1062-4fa7-b6e4-82da4a2a2865/download (re-verified for this ticket,
// not copied from the issue's table) — a curated slice of real rows (byte-
// sliced out of the real response, not hand-typed) covering: a normal V/V
// row with a 分機 value and a 、／； punctuation address, a 僅調劑-only
// pharmacy row (可給藥/可衛教 both blank), a row with 可衛教 blank, a 牙科診所
// category row, and a 藥局 row.
function loadFixtureBuffer() {
  return fs.readFileSync(FIXTURE_PATH);
}

test("real fixture: decodeBig5 produces readable Chinese text with no replacement characters", () => {
  const text = decodeBig5(loadFixtureBuffer());
  assert.ok(text.includes("醫事機構代碼"));
  assert.ok(!text.includes("�"));
});

test("real fixture: parseCsv + schema validation succeeds against the live header shape", () => {
  const text = decodeBig5(loadFixtureBuffer());
  const rows = parseCsv(text);
  assert.equal(rows.length, 5);
  assert.doesNotThrow(() =>
    validateImportRows("臺北市戒菸特約機構名冊 (121898)", smokingCessationTaipeiRawSchema, rows),
  );
});

test("real fixture: buildSmokingCessationTaipeiRecords maps a normal row, including 分機", () => {
  const text = decodeBig5(loadFixtureBuffer());
  const rows = parseCsv(text);
  const records = buildSmokingCessationTaipeiRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "國立臺灣大學醫學院附設醫院");
  assert.ok(r);
  assert.equal(r.sourceKey, SMOKING_CESSATION_TAIPEI_SOURCE_KEY);
  assert.equal(r.facilityType, "smoking_cessation");
  assert.equal(r.phone, "(02)23123456 分機62147");
  assert.equal(r.extra.smokingMedication, "可提供戒菸藥品");
  assert.equal(r.extra.smokingEducation, "可提供戒菸衛教");
  assert.equal(r.extra.smokingDispensingOnly, null);
  assert.equal(r.extra.dataAsOf, "2026-10-14");
});

test("real fixture: a 僅調劑-only pharmacy row has smokingDispensingOnly set and the other two flags null", () => {
  const text = decodeBig5(loadFixtureBuffer());
  const rows = parseCsv(text);
  const records = buildSmokingCessationTaipeiRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "怡誠藥局");
  assert.ok(r);
  assert.equal(r.extra.smokingDispensingOnly, "僅能調劑");
  assert.equal(r.extra.smokingMedication, null);
  assert.equal(r.extra.smokingEducation, null);
});

test("real fixture: a row with blank 可衛教 keeps smokingMedication set and smokingEducation null", () => {
  const text = decodeBig5(loadFixtureBuffer());
  const rows = parseCsv(text);
  const records = buildSmokingCessationTaipeiRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "宜康診所");
  assert.ok(r);
  assert.equal(r.extra.smokingMedication, "可提供戒菸藥品");
  assert.equal(r.extra.smokingEducation, null);
});

test("real fixture: serviceItem carries the 層級/category value", () => {
  const text = decodeBig5(loadFixtureBuffer());
  const rows = parseCsv(text);
  const records = buildSmokingCessationTaipeiRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "康卓牙醫診所");
  assert.ok(r);
  assert.equal(r.serviceItem, "牙科診所");
});

test("smokingCessationTaipeiRawSchema: throws if 院所名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("臺北市戒菸特約機構名冊 (121898)", smokingCessationTaipeiRawSchema, [
        { 醫事機構代碼: "1", 層級: "診所", 電話: "", 分機: "", 地址: "臺北市中正區1號", 可給藥: "V", 可衛教: "", 僅調劑: "" },
      ]),
    /field "院所名稱"/,
  );
});

test("smokingCessationTaipeiRawSchema: throws if 僅調劑 is renamed/removed upstream (the field this ticket exists to surface)", () => {
  assert.throws(
    () =>
      validateImportRows("臺北市戒菸特約機構名冊 (121898)", smokingCessationTaipeiRawSchema, [
        { 醫事機構代碼: "1", 層級: "診所", 院所名稱: "某診所", 電話: "", 分機: "", 地址: "臺北市中正區1號", 可給藥: "V", 可衛教: "" },
      ]),
    /field "僅調劑"/,
  );
});

test("buildSmokingCessationTaipeiRecords: skips a row missing 院所名稱 or 地址", () => {
  const rows = [
    { 醫事機構代碼: "1", 層級: "診所", 院所名稱: "", 電話: "", 分機: "", 地址: "臺北市中正區1號", 可給藥: "", 可衛教: "", 僅調劑: "" },
    { 醫事機構代碼: "2", 層級: "診所", 院所名稱: "某診所", 電話: "", 分機: "", 地址: "", 可給藥: "", 可衛教: "", 僅調劑: "" },
  ];
  const records = buildSmokingCessationTaipeiRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
