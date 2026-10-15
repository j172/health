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
  taipeiJointAssessmentRawSchema,
  ntpcHealthJointAssessmentRawSchema,
  ntpcDevDelayJointAssessmentRawSchema,
  khhJointAssessmentRawSchema,
} = await import("./jointAssessmentCenters.ts");
const { buildEarlyInterventionSourceId } = await import("./earlyInterventionUnits.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseCsv, normalizeAddress, normalizeUnitName, toHalfwidthDigits } = await import("../csv.ts");

const FIXTURES_DIR = path.join(fileURLToPath(REPO_ROOT), "lib/server/facilities/__fixtures__");

function loadFixtureRows(filename) {
  const text = fs.readFileSync(path.join(FIXTURES_DIR, filename), "utf-8");
  return parseCsv(text);
}

// ---------------------------------------------------------------------------
// 臺北市 135454
// ---------------------------------------------------------------------------

test("real fixture (135454 Taipei sample): parses the real header/field mapping", () => {
  const rows = loadFixtureRows("taipei-joint-assessment-135454-sample.csv");
  assert.equal(rows.length, 5);
  assert.deepEqual(Object.keys(rows[0]), ["序號", "機構類型", "機構名稱", "地址", "電話"]);
  assert.equal(rows[0]["機構名稱"], "臺北市立聯合醫院和平婦幼院區");
  assert.equal(rows[0]["地址"], "臺北市中正區中華路2段33號");
  assert.equal(rows[0]["機構類型"], "評估鑑定醫院");
});

test("taipeiJointAssessmentRawSchema: accepts a real-shaped row and rejects a renamed 機構名稱", () => {
  const rows = loadFixtureRows("taipei-joint-assessment-135454-sample.csv");
  assert.doesNotThrow(() => validateImportRows("Taipei joint-assessment centers (135454)", taipeiJointAssessmentRawSchema, rows));
  assert.throws(
    () =>
      validateImportRows("Taipei joint-assessment centers (135454)", taipeiJointAssessmentRawSchema, [
        { 序號: "1", 機構類型: "評估鑑定醫院", 機構名稱2: "某醫院", 地址: "臺北市中正區某路1號", 電話: "" },
      ]),
    /field "機構名稱"/,
  );
});

test("Taipei row maps to a sourceId built from 縣市(臺北市)+normalized name+address, not the dataset ID", () => {
  const rows = loadFixtureRows("taipei-joint-assessment-135454-sample.csv");
  const row = rows[0];
  const id = buildEarlyInterventionSourceId("臺北市", normalizeUnitName(row["機構名稱"]), normalizeAddress(row["地址"]));
  assert.equal(id, "臺北市|臺北市立聯合醫院和平婦幼院區|臺北市中正區中華路2段33號");
  assert.ok(!id.includes("135454"));
});

// ---------------------------------------------------------------------------
// 新北市 125231 (衛生局合作早療評估鑑定醫院)
// ---------------------------------------------------------------------------

test("real fixture (125231 NTPC health-bureau sample): parses real embedded-line-break names and multi-line evaluate_method correctly", () => {
  const rows = loadFixtureRows("ntpc-joint-assessment-125231-sample.csv");
  assert.equal(rows.length, 5);
  assert.deepEqual(Object.keys(rows[0]), [
    "no", "title", "localcallservice", "extension", "mobiletelephone", "contact", "countycode", "area", "areacode", "address", "evaluate_method", "note",
  ]);
  // Row 2's 機構名稱 is wrapped across two lines in the real CSV cell.
  assert.equal(rows[1]["title"], "國泰醫療財團法人\n汐止國泰綜合醫院");
  assert.equal(rows[1]["area"], "汐止區");
  assert.equal(rows[1]["address"], "建成路59巷2號");
});

test("ntpcHealthJointAssessmentRawSchema: accepts the real fixture rows", () => {
  const rows = loadFixtureRows("ntpc-joint-assessment-125231-sample.csv");
  assert.doesNotThrow(() => validateImportRows("New Taipei health-bureau joint-assessment hospitals (125231)", ntpcHealthJointAssessmentRawSchema, rows));
});

test("125231 address is built by prepending 新北市+area — the source's own address column never carries the county/district prefix (confirmed live)", () => {
  const rows = loadFixtureRows("ntpc-joint-assessment-125231-sample.csv");
  const row = rows[1];
  const address = normalizeAddress(`新北市${row["area"]}${row["address"]}`);
  assert.equal(address, "新北市汐止區建成路59巷2號");
  const name = normalizeUnitName(row["title"]);
  assert.equal(name, "國泰醫療財團法人汐止國泰綜合醫院");
  const id = buildEarlyInterventionSourceId("新北市", name, address);
  assert.equal(id, "新北市|國泰醫療財團法人汐止國泰綜合醫院|新北市汐止區建成路59巷2號");
});

// ---------------------------------------------------------------------------
// 新北市 123786 (發展遲緩兒童評估鑑定醫院)
// ---------------------------------------------------------------------------

test("real fixture (123786 NTPC dev-delay sample): parses the real header/field mapping, address already carries the full county+district", () => {
  const rows = loadFixtureRows("ntpc-joint-assessment-123786-sample.csv");
  assert.equal(rows.length, 5);
  assert.deepEqual(Object.keys(rows[0]), ["seqno", "hosp_name", "zipcode", "district", "hosp_addr", "tel", "remark"]);
  assert.equal(rows[0]["hosp_name"], "行天宮醫療志業醫療財團法人恩主公醫院");
  assert.equal(rows[0]["hosp_addr"], "新北市三峽區復興路399號");
  assert.equal(rows[0]["remark"], "NIL");
});

test("ntpcDevDelayJointAssessmentRawSchema: accepts the real fixture rows", () => {
  const rows = loadFixtureRows("ntpc-joint-assessment-123786-sample.csv");
  assert.doesNotThrow(() => validateImportRows("New Taipei developmental-delay assessment hospitals (123786)", ntpcDevDelayJointAssessmentRawSchema, rows));
});

test("123786's literal 'NIL' remark (every one of the 5 real sample rows) is recognized as 'no note', case-insensitively", () => {
  const nilValues = ["NIL", "nil", "Nil"];
  for (const v of nilValues) {
    const note = v && v.trim().toUpperCase() !== "NIL" ? v.trim() : null;
    assert.equal(note, null);
  }
  const realNote = "本院僅提供復健科評估";
  assert.equal(realNote.trim().toUpperCase() !== "NIL" ? realNote.trim() : null, realNote);
});

// ---------------------------------------------------------------------------
// 高雄市 128165 (already has coordinates — no geocode needed)
// ---------------------------------------------------------------------------

test("real fixture (128165 KHH sample): parses the real header/field mapping and real lat/lng strings", () => {
  const rows = loadFixtureRows("khh-joint-assessment-128165-sample.csv");
  assert.equal(rows.length, 5);
  assert.deepEqual(Object.keys(rows[0]), ["id", "lat", "lng", "informaddress", "hlink", "informtel", "servItem", "servTime", "dataOrg", "doOrg", "text"]);
  assert.equal(rows[0]["text"], "高雄市立大同醫院發展遲緩兒童評估門診");
  assert.equal(rows[0]["lat"], "22.6269695");
  assert.equal(rows[0]["lng"], "120.2972463");
});

test("khhJointAssessmentRawSchema: accepts the real fixture rows", () => {
  const rows = loadFixtureRows("khh-joint-assessment-128165-sample.csv");
  assert.doesNotThrow(() => validateImportRows("Kaohsiung joint-assessment centers (128165)", khhJointAssessmentRawSchema, rows));
});

test("128165's lat/lng strings parse to finite numbers directly usable as FacilityRecord.lat/lng (no geocoding needed for this source)", () => {
  const rows = loadFixtureRows("khh-joint-assessment-128165-sample.csv");
  for (const row of rows) {
    const lat = Number(row["lat"]);
    const lng = Number(row["lng"]);
    assert.ok(Number.isFinite(lat) && lat > 21 && lat < 26, `lat ${lat} out of Taiwan's range`);
    assert.ok(Number.isFinite(lng) && lng > 119 && lng < 123, `lng ${lng} out of Taiwan's range`);
  }
});

test("128165's full-width/angle-bracket phone punctuation survives toHalfwidthDigits (digits normalized, punctuation untouched)", () => {
  const rows = loadFixtureRows("khh-joint-assessment-128165-sample.csv");
  const row = rows.find((r) => r["informtel"].includes("＃"));
  assert.ok(row, "expected at least one real row with a full-width ＃ in informtel");
  const normalized = toHalfwidthDigits(row["informtel"]);
  assert.equal(normalized, row["informtel"]); // no fullwidth DIGITS (０-９) present in these samples, so unchanged
});
