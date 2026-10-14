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
  newTaipeiBabyFriendlyRawSchema,
  buildNewTaipeiBabyFriendlySourceId,
  mapNewTaipeiBabyFriendlyRows,
} = await import("./babyFriendlyHospitalNewTaipei.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseCsv } = await import("../csv.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/baby-friendly-new-taipei-123291-sample.csv",
);

function loadFixtureRows() {
  const text = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return parseCsv(text);
}

test("real fixture (123291 sample): parses the real CSV header/field mapping", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]), ["seqno", "hosp_name", "hosp_addr", "tel", "date"]);
  assert.equal(rows[0]["hosp_name"], "采新婦幼診所");
  assert.equal(rows[0]["date"], "20260211");
});

test("real fixture: every row shares the exact same `date` value (confirmed live on all 20 real rows) — a batch stamp, not a per-row expiry", () => {
  const rows = loadFixtureRows();
  const distinctDates = new Set(rows.map((r) => r.date));
  assert.equal(distinctDates.size, 1);
});

test("real fixture: schema validation passes on the real row shape", () => {
  const rows = loadFixtureRows();
  assert.doesNotThrow(() => validateImportRows("New Taipei baby-friendly hospitals (123291)", newTaipeiBabyFriendlyRawSchema, rows));
});

test("newTaipeiBabyFriendlyRawSchema: throws if the export renames hosp_addr (the address field)", () => {
  assert.throws(
    () =>
      validateImportRows("New Taipei baby-friendly hospitals (123291)", newTaipeiBabyFriendlyRawSchema, [
        { hosp_name: "測試診所", address: "新北市板橋區測試路1號", date: "20260211" },
      ]),
    /field "hosp_addr"/,
  );
});

test("buildNewTaipeiBabyFriendlySourceId: stable compound key name|address", () => {
  assert.equal(
    buildNewTaipeiBabyFriendlySourceId("采新婦幼診所", "新北市三重區正義北路86號"),
    "采新婦幼診所|新北市三重區正義北路86號",
  );
});

test("mapNewTaipeiBabyFriendlyRows: keeps every row — no per-row expiry filtering applies to this source", () => {
  const rows = loadFixtureRows();
  const records = mapNewTaipeiBabyFriendlyRows(rows);
  assert.equal(records.length, 3);
});

test("mapNewTaipeiBabyFriendlyRows: surfaces the shared batch date as dataVerifiedAt, never as a filter", () => {
  const rows = loadFixtureRows();
  const records = mapNewTaipeiBabyFriendlyRows(rows);
  for (const r of records) {
    assert.equal(r.extra.dataVerifiedAt, "2026-02-11");
    assert.equal(r.facilityType, "baby_friendly_hospital");
    assert.equal(r.sourceKey, "baby_friendly_hospital_new_taipei_123291");
    assert.equal(r.dataOrg, "新北市政府衛生局");
  }
});

test("mapNewTaipeiBabyFriendlyRows: halfwidth-normalizes phone numbers and drops rows missing a name/address", () => {
  const records = mapNewTaipeiBabyFriendlyRows([
    { hosp_name: "測試診所", hosp_addr: "新北市板橋區測試路1號", tel: "(０２)１２３４５６７８", date: "20260211" },
    { hosp_name: "", hosp_addr: "新北市板橋區測試路2號", tel: "", date: "20260211" },
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].phone, "(02)12345678");
});
