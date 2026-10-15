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
  smokingCessationTaoyuanRawSchema,
  buildSmokingCessationTaoyuanRecords,
  SMOKING_CESSATION_TAOYUAN_SOURCE_KEY,
} = await import("./smokingCessationTaoyuan.ts");
const { parseCsv } = await import("../csv.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/smoking-cessation-taoyuan-33872-sample.csv",
);

/**
 * **This fixture is NOT a real recorded sample** — unlike every other source
 * in this ticket, opendata.tycg.gov.tw could not be reached from this
 * session's working network to get a fresh real download (see
 * smokingCessationTaoyuan.ts's module comment: repeated timeouts, and the
 * one successful response was an F5 WAF rejection page, not the CSV).
 * These 3 rows are placeholder data matching the ticket's documented column
 * shape (`ROW_NO,機構代碼,機構層級,機構名稱,機構電話,機構地址,給藥,衛教`), named
 * "示範...(佔位資料)" so nobody mistakes them for real institutions.
 * Coordinator: replace this fixture with a genuine live sample once this
 * source's reachability is confirmed (see the ticket's own PR description).
 */
function loadRawText() {
  return fs.readFileSync(FIXTURE_PATH, "utf-8");
}

test("placeholder fixture: parseCsv + schema validation succeeds against the ticket's documented header shape", () => {
  const rows = parseCsv(loadRawText());
  assert.equal(rows.length, 3);
  assert.doesNotThrow(() => validateImportRows("桃園市戒菸特約機構名冊 (33872)", smokingCessationTaoyuanRawSchema, rows));
});

test("placeholder fixture: buildSmokingCessationTaoyuanRecords maps a normal V/V row", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationTaoyuanRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "示範醫院(佔位資料)");
  assert.ok(r);
  assert.equal(r.serviceItem, "區域醫院");
  assert.equal(r.extra.smokingMedication, "可提供戒菸藥品");
  assert.equal(r.extra.smokingEducation, "可提供戒菸衛教");
  assert.equal(r.extra.smokingDispensingOnly, null);
  assert.equal(r.sourceKey, SMOKING_CESSATION_TAOYUAN_SOURCE_KEY);
});

test("placeholder fixture: a row with blank 給藥 keeps smokingEducation set and smokingMedication null", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationTaoyuanRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "示範衛生所(佔位資料)");
  assert.ok(r);
  assert.equal(r.extra.smokingMedication, null);
  assert.equal(r.extra.smokingEducation, "可提供戒菸衛教");
});

test("smokingCessationTaoyuanRawSchema: throws if 機構名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("桃園市戒菸特約機構名冊 (33872)", smokingCessationTaoyuanRawSchema, [
        { 機構代碼: "1", 機構層級: "診所", 機構電話: "", 機構地址: "桃園市桃園區1號", 給藥: "V", 衛教: "" },
      ]),
    /field "機構名稱"/,
  );
});

test("buildSmokingCessationTaoyuanRecords: skips a row missing 機構名稱 or 機構地址", () => {
  const rows = [
    { 機構代碼: "1", 機構層級: "診所", 機構名稱: "", 機構電話: "", 機構地址: "桃園市桃園區1號", 給藥: "", 衛教: "" },
    { 機構代碼: "2", 機構層級: "診所", 機構名稱: "某診所", 機構電話: "", 機構地址: "", 給藥: "", 衛教: "" },
  ];
  const records = buildSmokingCessationTaoyuanRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
