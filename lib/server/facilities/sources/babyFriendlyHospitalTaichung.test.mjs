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
  taichungBabyFriendlyRawSchema,
  buildTaichungBabyFriendlySourceId,
  mapTaichungBabyFriendlyRows,
} = await import("./babyFriendlyHospitalTaichung.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseCsv } = await import("../csv.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/baby-friendly-taichung-83649-sample.csv",
);

function loadFixtureRows() {
  const text = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return parseCsv(text);
}

test("real fixture (83649 sample): parses the real CSV header/field mapping — no address or validity-date column at all", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]), ["縣市別代碼", "序號", "母嬰親善醫療院所名單", "行政區", "電話"]);
  assert.equal(rows[0]["母嬰親善醫療院所名單"], "亞洲大學附屬醫院");
  assert.equal(rows[0]["行政區"], "霧峰區");
});

test("real fixture: schema validation passes on the real row shape", () => {
  const rows = loadFixtureRows();
  assert.doesNotThrow(() => validateImportRows("Taichung baby-friendly hospitals (83649)", taichungBabyFriendlyRawSchema, rows));
});

test("taichungBabyFriendlyRawSchema: throws if the export renames 行政區 (the only location field this source has)", () => {
  assert.throws(
    () =>
      validateImportRows("Taichung baby-friendly hospitals (83649)", taichungBabyFriendlyRawSchema, [
        { 母嬰親善醫療院所名單: "測試醫院", 區域: "北區" },
      ]),
    /field "行政區"/,
  );
});

test("buildTaichungBabyFriendlySourceId: stable compound key name|district", () => {
  assert.equal(buildTaichungBabyFriendlySourceId("亞洲大學附屬醫院", "霧峰區"), "亞洲大學附屬醫院|霧峰區");
});

test("mapTaichungBabyFriendlyRows: builds a county+district address (no street address available from this source) and keeps every row — no 效期 column to filter on", () => {
  const rows = loadFixtureRows();
  const records = mapTaichungBabyFriendlyRows(rows);
  assert.equal(records.length, 3);
  assert.equal(records[0].address, "臺中市霧峰區");
  for (const r of records) {
    assert.equal(r.facilityType, "baby_friendly_hospital");
    assert.equal(r.sourceKey, "baby_friendly_hospital_taichung_83649");
    assert.equal(r.dataOrg, "臺中市政府衛生局");
  }
});

test("mapTaichungBabyFriendlyRows: drops a row missing the institution name or district", () => {
  const records = mapTaichungBabyFriendlyRows([
    { 母嬰親善醫療院所名單: "", 行政區: "北區", 電話: "" },
    { 母嬰親善醫療院所名單: "測試醫院", 行政區: "", 電話: "" },
  ]);
  assert.equal(records.length, 0);
});
