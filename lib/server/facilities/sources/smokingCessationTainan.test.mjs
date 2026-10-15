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
  smokingCessationTainanRawSchema,
  buildSmokingCessationTainanRecords,
  SMOKING_CESSATION_TAINAN_SOURCE_KEY,
} = await import("./smokingCessationTainan.ts");
const { parseCsv } = await import("../csv.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/smoking-cessation-tainan-140122-sample.csv",
);

// Real rows saved 2026-10-14 from a fresh download of
// https://data.tainan.gov.tw/File/ResourceCsvDownload/aa1335a9-b794-48f8-8243-0cf42413ffc4
// (re-verified for this ticket) — including the real 緯度/經度 columns the
// ticket's own table didn't mention (see smokingCessationTainan.ts's module
// comment), and the real embedded-BOM-mid-header artifact (`Seq,<BOM>機構代碼,
// ...`) confirmed on the live response's raw bytes.
function loadRawText() {
  return fs.readFileSync(FIXTURE_PATH, "utf-8");
}

test("real fixture: the raw file genuinely has an embedded BOM right after the first comma (sanity check on the fixture itself)", () => {
  const raw = loadRawText();
  const afterFirstComma = raw.indexOf(",") + 1;
  assert.equal(raw.charCodeAt(afterFirstComma), 0xfeff);
});

test("real fixture: parseCsv handles the embedded mid-header BOM correctly on its own (header cell comes out as \"機構代碼\", not BOM-prefixed)", () => {
  const rows = parseCsv(loadRawText());
  assert.ok(Object.prototype.hasOwnProperty.call(rows[0], "機構代碼"));
});

test("real fixture: parseCsv + schema validation succeeds directly against the raw embedded-BOM text", () => {
  const rows = parseCsv(loadRawText());
  assert.ok(rows.length >= 3);
  assert.doesNotThrow(() => validateImportRows("臺南市戒菸特約機構名冊 (140122)", smokingCessationTainanRawSchema, rows));
});

test("real fixture: buildSmokingCessationTainanRecords uses the row's own 緯度/經度 directly, no geocode fallback needed", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationTainanRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "永川醫院");
  assert.ok(r, "expected to find 永川醫院 in the fixture");
  assert.equal(r.lat, 22.998025);
  assert.equal(r.lng, 120.2063);
  assert.equal(r.sourceKey, SMOKING_CESSATION_TAINAN_SOURCE_KEY);
});

test("real fixture: address is built as 臺南市+村里+街路門牌 (no district name resolved from 地址-行政區域代碼, matching babyFriendlyHospitalTainan.ts's established convention)", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationTainanRecords(rows, "2026-10-14");
  const withVillage = records.find((x) => x.name === "永川醫院");
  assert.equal(withVillage.address, "臺南市觀音里成功路169號");
  const withoutVillage = records.find((x) => x.name === "衛生福利部臺南醫院");
  assert.equal(withoutVillage.address, "臺南市中山路125號");
});

test("real fixture: a row with blank 衛教 keeps smokingMedication set and smokingEducation null", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationTainanRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "張富全診所");
  assert.ok(r);
  assert.equal(r.extra.smokingMedication, "可提供戒菸藥品");
  assert.equal(r.extra.smokingEducation, null);
  assert.equal(r.extra.smokingDispensingOnly, null);
});

test("smokingCessationTainanRawSchema: throws if 機構名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("臺南市戒菸特約機構名冊 (140122)", smokingCessationTainanRawSchema, [
        { 機構層級: "診所", 市話: "", "地址-街路門牌": "中山路1號", 給藥: "V", 衛教: "", 緯度: "23", 經度: "120" },
      ]),
    /field "機構名稱"/,
  );
});

test("buildSmokingCessationTainanRecords: skips a row missing 機構名稱 or 地址-街路門牌", () => {
  const rows = [
    { 機構層級: "診所", 機構名稱: "", 市話: "", "地址-村里": "", "地址-街路門牌": "中山路1號", 給藥: "", 衛教: "", 緯度: "", 經度: "" },
    { 機構層級: "診所", 機構名稱: "某診所", 市話: "", "地址-村里": "", "地址-街路門牌": "", 給藥: "", 衛教: "", 緯度: "", 經度: "" },
  ];
  const records = buildSmokingCessationTainanRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
