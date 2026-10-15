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
  smokingCessationKaohsiungRawSchema,
  buildSmokingCessationKaohsiungRecords,
  SMOKING_CESSATION_KAOHSIUNG_SOURCE_KEY,
} = await import("./smokingCessationKaohsiung.ts");
const { parseCsv } = await import("../csv.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/smoking-cessation-kaohsiung-87259-sample.csv",
);

// Real rows saved 2026-10-14 from a fresh download of
// https://data.kcg.gov.tw/File/DirectDownload/111621ba-db29-4fe2-b310-a85125804e27
// (re-verified for this ticket) — covering a normal 藥局 row with both flags
// set, a 診所 row with blank 衛教, and a 牙科診所 row.
function loadRawText() {
  return fs.readFileSync(FIXTURE_PATH, "utf-8");
}

test("real fixture: parseCsv + schema validation succeeds against the live header shape", () => {
  const rows = parseCsv(loadRawText());
  assert.ok(rows.length >= 3);
  assert.doesNotThrow(() => validateImportRows("高雄市戒菸特約機構名冊 (87259)", smokingCessationKaohsiungRawSchema, rows));
});

test("real fixture: address already carries the full 高雄市○○區 string, no prefix needed, and 區號 is left unused", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationKaohsiungRecords(rows, "2026-10-14");
  assert.ok(records.every((r) => r.address.startsWith("高雄市")));
});

test("real fixture: buildSmokingCessationKaohsiungRecords maps a normal V/V 藥局 row", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationKaohsiungRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "連作藥局");
  assert.ok(r);
  assert.equal(r.serviceItem, "藥局");
  assert.equal(r.extra.smokingMedication, "可提供戒菸藥品");
  assert.equal(r.extra.smokingEducation, "可提供戒菸衛教");
  assert.equal(r.extra.smokingDispensingOnly, null);
  assert.equal(r.sourceKey, SMOKING_CESSATION_KAOHSIUNG_SOURCE_KEY);
});

test("real fixture: a row with blank 衛教 keeps smokingMedication set and smokingEducation null", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationKaohsiungRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "上仁診所");
  assert.ok(r);
  assert.equal(r.extra.smokingMedication, "可提供戒菸藥品");
  assert.equal(r.extra.smokingEducation, null);
});

test("real fixture: a 牙科診所 category row is tagged correctly", () => {
  const rows = parseCsv(loadRawText());
  const records = buildSmokingCessationKaohsiungRecords(rows, "2026-10-14");
  const r = records.find((x) => x.name === "博美牙醫診所");
  assert.ok(r);
  assert.equal(r.serviceItem, "牙科診所");
});

test("smokingCessationKaohsiungRawSchema: throws if 醫事機構名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("高雄市戒菸特約機構名冊 (87259)", smokingCessationKaohsiungRawSchema, [
        { 醫事機構: "診所", 市話: "", 地址: "高雄市新興區1號", 給藥: "V", 衛教: "" },
      ]),
    /field "醫事機構名稱"/,
  );
});

test("buildSmokingCessationKaohsiungRecords: skips a row missing 醫事機構名稱 or 地址", () => {
  const rows = [
    { 醫事機構: "診所", 醫事機構名稱: "", 市話: "", 地址: "高雄市新興區1號", 給藥: "", 衛教: "" },
    { 醫事機構: "診所", 醫事機構名稱: "某診所", 市話: "", 地址: "", 給藥: "", 衛教: "" },
  ];
  const records = buildSmokingCessationKaohsiungRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
