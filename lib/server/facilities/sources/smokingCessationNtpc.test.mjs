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
  smokingCessationNtpcRawSchema,
  buildSmokingCessationNtpcRecords,
  SMOKING_CESSATION_NTPC_SOURCE_KEY,
  SMOKING_CESSATION_NTPC_DENTAL_SOURCE_KEY,
} = await import("./smokingCessationNtpc.ts");
const { parseCsv } = await import("../csv.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const REPO_ROOT_PATH = fileURLToPath(REPO_ROOT);
const GENERAL_FIXTURE = path.join(REPO_ROOT_PATH, "lib/server/facilities/__fixtures__/smoking-cessation-ntpc-124244-sample.csv");
const DENTAL_FIXTURE = path.join(REPO_ROOT_PATH, "lib/server/facilities/__fixtures__/smoking-cessation-ntpc-dental-125915-sample.csv");

// Real rows saved 2026-10-14 from fresh downloads of
// https://data.ntpc.gov.tw/api/datasets/1a03a6ed-9ca2-4d8e-a2be-84c70c659349/csv/file
// (124244) and .../425e3fcd-f467-4cac-b212-acd0bb604bd2/csv/file (125915) —
// re-verified for this ticket, not copied from the issue's table. Both
// real downloads currently have every row's twd97x/y and wgs84ax/ay
// coordinate columns blank (confirmed against all 636 + 244 live rows, not
// a sampling fluke) — contradicting the ticket's claim that these sources
// "自帶...座標"; see smokingCessationNtpc.ts's module comment.
function loadCsv(fixturePath) {
  return fs.readFileSync(fixturePath, "utf-8");
}

test("real 124244 fixture: parseCsv + schema validation succeeds against the live header shape", () => {
  const rows = parseCsv(loadCsv(GENERAL_FIXTURE));
  assert.ok(rows.length >= 5);
  assert.doesNotThrow(() => validateImportRows("新北市戒菸特約機構名冊 (124244)", smokingCessationNtpcRawSchema, rows));
});

test("real 124244 fixture: address already carries the full 新北市○○區 string, no prefix needed", () => {
  const rows = parseCsv(loadCsv(GENERAL_FIXTURE));
  const records = buildSmokingCessationNtpcRecords(rows, SMOKING_CESSATION_NTPC_SOURCE_KEY, "新北市政府衛生局", "2026-10-14");
  assert.ok(records.every((r) => r.address.startsWith("新北市")));
});

test("real 124244 fixture: coordinates currently blank on every row → lat/lng both null (falls through to the geocode batch)", () => {
  const rows = parseCsv(loadCsv(GENERAL_FIXTURE));
  const records = buildSmokingCessationNtpcRecords(rows, SMOKING_CESSATION_NTPC_SOURCE_KEY, "新北市政府衛生局", "2026-10-14");
  assert.ok(records.length > 0);
  assert.ok(records.every((r) => r.lat === null && r.lng === null));
});

test("real 124244 fixture: no 給藥/衛教/僅調劑 columns at all → every extra flag is null, never guessed", () => {
  const rows = parseCsv(loadCsv(GENERAL_FIXTURE));
  const records = buildSmokingCessationNtpcRecords(rows, SMOKING_CESSATION_NTPC_SOURCE_KEY, "新北市政府衛生局", "2026-10-14");
  assert.ok(records.every((r) => r.extra.smokingMedication === null && r.extra.smokingEducation === null && r.extra.smokingDispensingOnly === null));
});

test("real 124244 fixture: type column maps to serviceItem (category)", () => {
  const rows = parseCsv(loadCsv(GENERAL_FIXTURE));
  const records = buildSmokingCessationNtpcRecords(rows, SMOKING_CESSATION_NTPC_SOURCE_KEY, "新北市政府衛生局", "2026-10-14");
  const categories = new Set(records.map((r) => r.serviceItem));
  assert.ok(categories.size > 1, "expected more than one distinct category across the fixture's curated rows");
});

test("real 125915 fixture: dental source uses its own distinct sourceKey", () => {
  const rows = parseCsv(loadCsv(DENTAL_FIXTURE));
  assert.doesNotThrow(() => validateImportRows("新北市戒菸特約牙醫診所名冊 (125915)", smokingCessationNtpcRawSchema, rows));
  const records = buildSmokingCessationNtpcRecords(rows, SMOKING_CESSATION_NTPC_DENTAL_SOURCE_KEY, "新北市政府衛生局", "2026-10-14");
  assert.ok(records.length > 0);
  assert.ok(records.every((r) => r.sourceKey === SMOKING_CESSATION_NTPC_DENTAL_SOURCE_KEY));
  assert.ok(records.every((r) => r.serviceItem === "牙科診所"));
});

test("parseCoordinate (via buildSmokingCessationNtpcRecords): a populated wgs84 pair is used directly, future-proofing against upstream re-populating it", () => {
  const rows = [
    {
      name: "測試診所",
      type: "診所",
      telephone: "02-12345678",
      district: "板橋區",
      address: "新北市板橋區文化路1號",
      wgs84ax_longitude: "121.4627",
      wgs84ay_latitude: "25.0103",
    },
  ];
  const records = buildSmokingCessationNtpcRecords(rows, SMOKING_CESSATION_NTPC_SOURCE_KEY, "新北市政府衛生局", "2026-10-14");
  assert.equal(records[0].lat, 25.0103);
  assert.equal(records[0].lng, 121.4627);
});

test("smokingCessationNtpcRawSchema: throws if name is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("新北市戒菸特約機構名冊 (124244)", smokingCessationNtpcRawSchema, [
        { type: "診所", telephone: "", district: "板橋區", address: "新北市板橋區1號", wgs84ax_longitude: "", wgs84ay_latitude: "" },
      ]),
    /field "name"/,
  );
});

test("buildSmokingCessationNtpcRecords: skips a row missing name or address", () => {
  const rows = [
    { name: "", type: "診所", telephone: "", district: "板橋區", address: "新北市板橋區1號", wgs84ax_longitude: "", wgs84ay_latitude: "" },
    { name: "某診所", type: "診所", telephone: "", district: "板橋區", address: "", wgs84ax_longitude: "", wgs84ay_latitude: "" },
  ];
  const records = buildSmokingCessationNtpcRecords(rows, SMOKING_CESSATION_NTPC_SOURCE_KEY, "新北市政府衛生局", "2026-10-14");
  assert.equal(records.length, 0);
});
