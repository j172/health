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
  smokingCessationTaichungRawSchema,
  buildSmokingCessationTaichungRecords,
  SMOKING_CESSATION_TAICHUNG_SOURCE_KEY,
} = await import("./smokingCessationTaichung.ts");
const { parseCsv } = await import("../csv.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/smoking-cessation-taichung-81720-sample.csv",
);

// Real rows saved 2026-10-14 from a fresh download of
// https://newdatacenter.taichung.gov.tw/api/v1/no-auth/resource.download?rid=
// 3c195fed-5b29-4333-aa24-9e93e1d851fb (re-verified for this ticket). The
// header line is deliberately prefixed with TWO literal U+FEFF BOM
// characters here — that's exactly what the real file's raw bytes carry
// (confirmed on the buffer: `EF BB BF EF BB BF`), not a typo in this
// fixture.
function loadRawText() {
  return fs.readFileSync(FIXTURE_PATH, "utf-8");
}

test("real fixture: the raw file genuinely starts with a double BOM (sanity check on the fixture itself)", () => {
  const raw = loadRawText();
  assert.equal(raw.charCodeAt(0), 0xfeff);
  assert.equal(raw.charCodeAt(1), 0xfeff);
});

test("real fixture: parseCsv handles the double-leading-BOM correctly on its own — the header cell comes out clean (\"序號\", not BOM-prefixed) because parseCsv()'s header .trim() treats U+FEFF as whitespace", () => {
  const raw = loadRawText();
  const rows = parseCsv(raw);
  assert.ok(Object.prototype.hasOwnProperty.call(rows[0], "序號"));
});

test("real fixture: parseCsv + schema validation succeeds directly against the raw double-BOM text, no extra stripping needed", () => {
  const rows = parseCsv(loadRawText());
  assert.ok(rows.length >= 3);
  assert.doesNotThrow(() => validateImportRows("臺中市戒菸特約機構名冊 (81720)", smokingCessationTaichungRawSchema, rows));
});

test("real fixture: buildSmokingCessationTaichungRecords maps a normal V/V row and halfwidths a fullwidth-digit address", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationTaichungRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "成真診所");
  assert.ok(r, "expected to find 成真診所 in the fixture");
  // Source address has fullwidth "１０８" — normalizeAddress halfwidths it.
  assert.equal(r.address, "臺中市中區平等街108號");
  assert.equal(r.extra.smokingMedication, "可提供戒菸藥品");
  assert.equal(r.extra.smokingEducation, null);
  assert.equal(r.extra.smokingDispensingOnly, null);
  assert.equal(r.sourceKey, SMOKING_CESSATION_TAICHUNG_SOURCE_KEY);
});

test("real fixture: a row with blank 給藥 keeps smokingEducation set and smokingMedication null", () => {
  const cleaned = loadRawText().replace(/﻿/g, "");
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationTaichungRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "臺中市東區衛生所");
  assert.ok(r);
  assert.equal(r.extra.smokingMedication, null);
  assert.equal(r.extra.smokingEducation, "可提供戒菸衛教");
  assert.equal(r.serviceItem, "衛生所");
});

test("smokingCessationTaichungRawSchema: throws if 機構名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("臺中市戒菸特約機構名冊 (81720)", smokingCessationTaichungRawSchema, [
        { 機構層級: "診所", 電話: "", 機構地址: "臺中市中區1號", 給藥: "V", 衛教: "" },
      ]),
    /field "機構名稱"/,
  );
});

test("buildSmokingCessationTaichungRecords: skips a row missing 機構名稱 or 機構地址", () => {
  const rows = [
    { 機構層級: "診所", 機構名稱: "", 電話: "", 機構地址: "臺中市中區1號", 給藥: "", 衛教: "" },
    { 機構層級: "診所", 機構名稱: "某診所", 電話: "", 機構地址: "", 給藥: "", 衛教: "" },
  ];
  const records = buildSmokingCessationTaichungRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
