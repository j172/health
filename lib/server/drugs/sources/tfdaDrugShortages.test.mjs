import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";

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
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const {
  DRUG_SHORTAGE_SOURCES,
  parseDrugShortages,
  isNoDataPlaceholder,
  splitProductName,
  toIsoDate,
  bufferToJsonText,
  tfdaDrugShortageRawSchema,
} = await import("./tfdaDrugShortages.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const WITH_ALT = DRUG_SHORTAGE_SOURCES.find((s) => s.datasetId === "54504");
const WITHOUT_ALT = DRUG_SHORTAGE_SOURCES.find((s) => s.datasetId === "54505");

const sample = JSON.parse(
  readFileSync(new URL("./__fixtures__/tfda-drug-shortage-54504-sample.json", import.meta.url), "utf-8"),
);
const emptyPlaceholderText = readFileSync(
  new URL("./__fixtures__/tfda-drug-shortage-54505-empty.json", import.meta.url),
  "utf-8",
);

const row = (overrides = {}) => ({
  編號: "1",
  公告更新時間: "2026/10/07",
  中文品名: "測試藥品錠\nTEST TABLETS",
  許可證字號: "衛署藥製字第000001號",
  供應狀態: "1.某藥廠表示，因生產問題暫停出貨。",
  ...overrides,
});

test("sources: 54504 is the with-alternative list and 54505 the no-alternative list, both on the already-reachable data.fda.gov.tw", () => {
  assert.equal(DRUG_SHORTAGE_SOURCES.length, 2);
  assert.equal(WITH_ALT.hasAlternative, true);
  assert.equal(WITHOUT_ALT.hasAlternative, false);
  assert.equal(WITH_ALT.url, "https://data.fda.gov.tw/data/opendata/export/104/json");
  assert.equal(WITHOUT_ALT.url, "https://data.fda.gov.tw/data/opendata/export/105/json");
  // Distinct source keys so a license appearing in both lists is two rows, not one.
  assert.notEqual(WITH_ALT.sourceKey, WITHOUT_ALT.sourceKey);
  // drug_shortages.source_key is VARCHAR(40).
  for (const s of DRUG_SHORTAGE_SOURCES) assert.ok(s.sourceKey.length <= 40);
});

test("54505 today: the single 編號 '沒有資料' placeholder row parses to an empty array without throwing", () => {
  const raw = JSON.parse(emptyPlaceholderText);
  assert.equal(raw.length, 1);
  assert.equal(raw[0].編號, "沒有資料");
  assert.equal(isNoDataPlaceholder(raw), true);
  assert.deepEqual(parseDrugShortages(raw, WITHOUT_ALT), []);
});

test("isNoDataPlaceholder: real data, an empty array and a mixed payload are not the placeholder", () => {
  assert.equal(isNoDataPlaceholder(sample), false);
  assert.equal(isNoDataPlaceholder([]), false);
  assert.equal(isNoDataPlaceholder([row(), row({ 編號: "沒有資料" })]), false);
  assert.equal(isNoDataPlaceholder("沒有資料"), false);
});

test("54505 later gets real rows (same shape as 54504): they parse as no-alternative shortages", () => {
  const records = parseDrugShortages([row()], WITHOUT_ALT);
  assert.equal(records.length, 1);
  assert.equal(records[0].hasAlternative, false);
  assert.equal(records[0].sourceKey, WITHOUT_ALT.sourceKey);
});

test("parseDrugShortages: maps a real 54504 sample (8 rows) field by field", () => {
  const records = parseDrugShortages(sample, WITH_ALT);
  assert.equal(records.length, 8);

  const first = records.find((r) => r.licenseNo === "衛署藥製字第040794號");
  assert.ok(first);
  assert.equal(first.sourceKey, WITH_ALT.sourceKey);
  assert.equal(first.hasAlternative, true);
  assert.equal(first.nameZh, '"井田"可嗽平錠');
  assert.equal(first.nameEn, 'COSOPIN TABLETS "CHINTENG"');
  assert.equal(first.announcedOn, "2026-10-07");
  assert.match(first.supplyStatus, /^1\.井田國際醫藥廠股份有限公司表示/);
  // Windows line endings in the upstream text are normalized.
  assert.ok(!first.supplyStatus.includes("\r"));
  assert.match(first.rowKey, /^[0-9a-f]{64}$/);
});

test("parseDrugShortages: the same 許可證字號 on several rows keeps every row (license is not a key), each with its own rowKey", () => {
  const records = parseDrugShortages(sample, WITH_ALT);
  const taxol = records.filter((r) => r.licenseNo === "衛署藥輸字第021157號");
  const dormicum = records.filter((r) => r.licenseNo === "衛署藥輸字第017577號");
  assert.equal(taxol.length, 2);
  assert.equal(dormicum.length, 2);
  assert.notEqual(taxol[0].rowKey, taxol[1].rowKey);
  assert.notEqual(dormicum[0].rowKey, dormicum[1].rowKey);
  assert.equal(new Set(records.map((r) => r.rowKey)).size, records.length);
});

test("rowKey is stable across runs and ignores 編號 and 公告更新時間 (a re-announcement updates the row instead of inserting a new one)", () => {
  const a = parseDrugShortages([row()], WITH_ALT)[0];
  const b = parseDrugShortages([row()], WITH_ALT)[0];
  assert.equal(a.rowKey, b.rowKey);

  const renumbered = parseDrugShortages([row({ 編號: "99", 公告更新時間: "2027/01/15" })], WITH_ALT)[0];
  assert.equal(renumbered.rowKey, a.rowKey);
  assert.equal(renumbered.announcedOn, "2027-01-15");

  // The wording of the supply status is part of identity: an edited notice is a different row.
  const edited = parseDrugShortages([row({ 供應狀態: "已恢復供應" })], WITH_ALT)[0];
  assert.notEqual(edited.rowKey, a.rowKey);
});

test("rowKey differs between the two datasets for an otherwise identical row", () => {
  const withAlt = parseDrugShortages([row()], WITH_ALT)[0];
  const withoutAlt = parseDrugShortages([row()], WITHOUT_ALT)[0];
  assert.notEqual(withAlt.rowKey, withoutAlt.rowKey);
});

test("fully identical rows are told apart by an occurrence counter, and the counter does not depend on row order", () => {
  const records = parseDrugShortages([row(), row(), row()], WITH_ALT);
  assert.equal(records.length, 3);
  assert.equal(new Set(records.map((r) => r.rowKey)).size, 3);

  const reversed = parseDrugShortages([row(), row(), row()].reverse(), WITH_ALT);
  assert.deepEqual(new Set(reversed.map((r) => r.rowKey)), new Set(records.map((r) => r.rowKey)));
});

test("toIsoDate: converts YYYY/MM/DD and rejects placeholders, impossible dates and out-of-range years", () => {
  assert.equal(toIsoDate("2026/10/07"), "2026-10-07");
  assert.equal(toIsoDate("2026/1/5"), "2026-01-05");
  assert.equal(toIsoDate(" 2020/11/25 "), "2020-11-25");
  assert.equal(toIsoDate("2026-10-07"), "2026-10-07");
  assert.equal(toIsoDate("2026/02/30"), null);
  assert.equal(toIsoDate("1911/01/01"), null);
  assert.equal(toIsoDate("2819/11/18"), null);
  assert.equal(toIsoDate("2026/13/01"), null);
  assert.equal(toIsoDate("not a date"), null);
  assert.equal(toIsoDate(""), null);
  assert.equal(toIsoDate(null), null);
  assert.equal(toIsoDate(undefined), null);
});

test("a row with a bad 公告更新時間 is still kept, with announcedOn null (a shortage notice must not vanish over a date typo)", () => {
  const records = parseDrugShortages([row({ 公告更新時間: "2819/11/18" })], WITH_ALT);
  assert.equal(records.length, 1);
  assert.equal(records[0].announcedOn, null);
});

test("splitProductName: first line is the Chinese name, the rest is the English name", () => {
  assert.deepEqual(splitProductName("普拿疼錠\nPANADOL TABLETS"), { nameZh: "普拿疼錠", nameEn: "PANADOL TABLETS" });
  assert.deepEqual(splitProductName("普拿疼錠\r\nPANADOL\r\nTABLETS"), { nameZh: "普拿疼錠", nameEn: "PANADOL TABLETS" });
  assert.deepEqual(splitProductName("  普拿疼錠  "), { nameZh: "普拿疼錠", nameEn: null });
  assert.deepEqual(splitProductName("PANADOL TABLETS"), { nameZh: "PANADOL TABLETS", nameEn: null });
  assert.deepEqual(splitProductName(""), { nameZh: "", nameEn: null });
  assert.deepEqual(splitProductName(null), { nameZh: "", nameEn: null });
});

test("rows with neither a product name nor a license are dropped; a missing license alone is not (the notice is still worth showing)", () => {
  const records = parseDrugShortages(
    [row({ 中文品名: null, 許可證字號: null }), row({ 許可證字號: null }), row({ 中文品名: "  ", 許可證字號: "衛署藥製字第000002號" })],
    WITH_ALT,
  );
  assert.equal(records.length, 2);
  assert.equal(records[0].licenseNo, "");
  assert.equal(records[1].nameZh, "");
  assert.equal(records[1].licenseNo, "衛署藥製字第000002號");
});

test("an empty 供應狀態 becomes null instead of an empty string", () => {
  const records = parseDrugShortages([row({ 供應狀態: "  " }), row({ 供應狀態: null, 許可證字號: "衛署藥製字第000003號" })], WITH_ALT);
  assert.equal(records[0].supplyStatus, null);
  assert.equal(records[1].supplyStatus, null);
});

test("parseDrugShortages: throws a descriptive error when upstream renames the license field, so a schema change does not silently empty the table", () => {
  assert.throws(
    () => parseDrugShortages([{ 編號: "1", 公告更新時間: "2026/10/07", 中文品名: "某藥", LicenseNo: "x" }], WITH_ALT),
    /field "許可證字號"/,
  );
  assert.throws(
    () => validateImportRows("x", tfdaDrugShortageRawSchema, [{ 許可證字號: 123, 中文品名: "某藥" }]),
    /field "許可證字號"/,
  );
});

test("parseDrugShortages: throws when the payload is not an array (e.g. an HTML block page parsed as JSON string)", () => {
  assert.throws(() => parseDrugShortages({ error: "blocked" }, WITH_ALT), /expected an array/);
});

test("bufferToJsonText: plain JSON, BOM-prefixed JSON and a ZIP-wrapped JSON all decode to parseable text (same host serves ZIPs for other exports)", () => {
  const json = JSON.stringify([row()]);

  assert.deepEqual(JSON.parse(bufferToJsonText(Buffer.from(json, "utf-8"))), [row()]);
  assert.deepEqual(JSON.parse(bufferToJsonText(Buffer.from("﻿" + json, "utf-8"))), [row()]);

  const zip = new AdmZip();
  zip.addFile("shortage.json", Buffer.from(json, "utf-8"));
  assert.deepEqual(JSON.parse(bufferToJsonText(zip.toBuffer())), [row()]);
});

test("bufferToJsonText: a ZIP with no .json entry throws instead of returning garbage", () => {
  const zip = new AdmZip();
  zip.addFile("readme.txt", Buffer.from("hello", "utf-8"));
  assert.throws(() => bufferToJsonText(zip.toBuffer()), /no \.json entry/);
});
