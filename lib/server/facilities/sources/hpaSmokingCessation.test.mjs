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
  odsCellText,
  parseOdsSheetRows,
  odsRowsToRecords,
  hpaSmokingCessationRawSchema,
  buildHpaSmokingCessationSourceId,
} = await import("./hpaSmokingCessation.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const SHEET_NAME = "各縣市合約戒菸醫療院所";
const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/hpa-smoking-cessation-6954-sample-content.xml",
);

// Real content.xml excerpt saved 2026-10-14 from the live ODS download
// (https://www.hpa.gov.tw/Pages/ashx/GetFile.ashx?lang=c&type=1&sid=
// 76891782db634c60b4dc055a7de50bc0) — the document preamble/namespaces and
// closing tags are byte-for-byte from the real file, and the row set is a
// curated selection of real rows (not hand-authored) chosen to cover: a
// normal row, a row whose phone cell has the `<text:s text:c="N"/>`
// trailing-space-run encoding, a row using the old pre-2014 "桃園縣" county
// name, a row with fullwidth digits in its address, a row with no 給藥 flag,
// a row with no 衛教 flag, a 牙科診所/衛生所 category row each, and the
// real trailing `table:number-rows-repeated="1045737"` bulk-blank row the
// live file ends every sheet with.
function loadFixtureXml() {
  return fs.readFileSync(FIXTURE_PATH, "utf-8");
}

test("odsCellText: strips a <text:s text:c=\"N\"/> repeated-space run (real phone-cell padding)", () => {
  assert.equal(
    odsCellText('<text:p>02-23123456-2147<text:s text:c="4"/></text:p>'),
    "02-23123456-2147",
  );
});

test("odsCellText: strips a bare <text:s/> (single space)", () => {
  assert.equal(odsCellText("<text:p>A<text:s/>B</text:p>"), "A B");
});

test("odsCellText: returns an empty string for a cell with no <text:p> at all", () => {
  assert.equal(odsCellText(""), "");
});

test("odsCellText: decodes XML entities", () => {
  assert.equal(odsCellText("<text:p>A&amp;B &lt;C&gt;</text:p>"), "A&B <C>");
});

test("real fixture: parseOdsSheetRows finds the sheet and returns header + all data rows + the trailing bulk-blank row", () => {
  const grid = parseOdsSheetRows(loadFixtureXml(), SHEET_NAME);
  // header + 7 curated data rows + 1 trailing synthetic bulk-blank row.
  assert.equal(grid.length, 9);
  // The real header row carries one extra trailing blank-label cell — the
  // same "represent the rest of the row compactly" placeholder every data
  // row also has past its 7 real columns (table:number-columns-repeated).
  // parseOdsSheetRows() doesn't strip it (that's odsRowsToRecords()'s job,
  // tested separately below) — it returns exactly what's in the XML.
  assert.deepEqual(grid[0], ["醫事機構類別", "院所名稱", "電話", "郵遞區號", "地址", "給藥", "衛教", ""]);
});

test("real fixture: parseOdsSheetRows correctly reassembles a text:s-padded phone number", () => {
  const grid = parseOdsSheetRows(loadFixtureXml(), SHEET_NAME);
  const taipeiVeterans = grid.find((row) => row[1] === "國立臺灣大學醫學院附設醫院");
  assert.ok(taipeiVeterans, "expected to find 國立臺灣大學醫學院附設醫院 in the fixture");
  assert.equal(taipeiVeterans[2], "02-23123456-2147");
  assert.equal(taipeiVeterans[3], "10002");
  assert.equal(taipeiVeterans[4], "臺北市中正區中山南路7號");
  assert.equal(taipeiVeterans[5], "V");
  assert.equal(taipeiVeterans[6], "V");
});

test("real fixture: parseOdsSheetRows preserves a fullwidth-digit address untouched (normalization happens later, not in the parser)", () => {
  const grid = parseOdsSheetRows(loadFixtureXml(), SHEET_NAME);
  const row = grid.find((r) => r[1] === "杏慈診所");
  assert.ok(row, "expected to find 杏慈診所 in the fixture");
  assert.equal(row[4], "臺北市中山區民權東路２段152巷2-1號1樓");
});

test("real fixture: parseOdsSheetRows preserves the old pre-2014 桃園縣 county name as-is", () => {
  const grid = parseOdsSheetRows(loadFixtureXml(), SHEET_NAME);
  const row = grid.find((r) => r[1] === "吳家淦耳鼻喉科診所");
  assert.ok(row);
  assert.equal(row[4], "桃園縣中壢市中山路21號");
});

test("real fixture: throws when the sheet name doesn't match (upstream renamed the sheet)", () => {
  assert.throws(() => parseOdsSheetRows(loadFixtureXml(), "不存在的分頁"), /sheet "不存在的分頁" not found/);
});

test("parseOdsSheetRows: throws on a document with no matching <table:table> at all", () => {
  assert.throws(() => parseOdsSheetRows("<office:document-content></office:document-content>", SHEET_NAME), /not found/);
});

test("real fixture: odsRowsToRecords maps by header position and drops the trailing bulk-blank row", () => {
  const grid = parseOdsSheetRows(loadFixtureXml(), SHEET_NAME);
  const records = odsRowsToRecords(grid);
  // 7 curated data rows; the bulk-blank trailing row has no 院所名稱 and is dropped.
  assert.equal(records.length, 7);
  for (const r of records) {
    assert.deepEqual(Object.keys(r), ["醫事機構類別", "院所名稱", "電話", "郵遞區號", "地址", "給藥", "衛教"]);
  }
});

test("real fixture: odsRowsToRecords keeps a row with a legitimately blank 給藥 flag (confirmed live: 4/2838 rows)", () => {
  const grid = parseOdsSheetRows(loadFixtureXml(), SHEET_NAME);
  const records = odsRowsToRecords(grid);
  const row = records.find((r) => r["院所名稱"] === "龍潭敏盛醫院");
  assert.ok(row);
  assert.equal(row["給藥"], "");
  assert.equal(row["衛教"], "V");
});

test("real fixture: odsRowsToRecords keeps a row with a legitimately blank 衛教 flag (confirmed live: 2098/2838 rows)", () => {
  const grid = parseOdsSheetRows(loadFixtureXml(), SHEET_NAME);
  const records = odsRowsToRecords(grid);
  const row = records.find((r) => r["院所名稱"] === "杏慈診所");
  assert.ok(row);
  assert.equal(row["給藥"], "V");
  assert.equal(row["衛教"], "");
});

test("real fixture: odsRowsToRecords output validates against hpaSmokingCessationRawSchema with no throw", () => {
  const grid = parseOdsSheetRows(loadFixtureXml(), SHEET_NAME);
  const records = odsRowsToRecords(grid);
  assert.doesNotThrow(() =>
    validateImportRows("HPA smoking-cessation facilities (6954)", hpaSmokingCessationRawSchema, records),
  );
});

test("odsRowsToRecords: an empty grid returns an empty array", () => {
  assert.deepEqual(odsRowsToRecords([]), []);
});

test("odsRowsToRecords: a header-only grid (no data rows) returns an empty array", () => {
  assert.deepEqual(odsRowsToRecords([["醫事機構類別", "院所名稱"]]), []);
});

test("hpaSmokingCessationRawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("HPA smoking-cessation facilities (6954)", hpaSmokingCessationRawSchema, [
      {
        醫事機構類別: "醫學中心",
        院所名稱: "國立臺灣大學醫學院附設醫院",
        電話: "02-23123456-2147",
        郵遞區號: "10002",
        地址: "臺北市中正區中山南路7號",
        給藥: "V",
        衛教: "V",
      },
    ]),
  );
});

test("hpaSmokingCessationRawSchema: throws if 院所名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("HPA smoking-cessation facilities (6954)", hpaSmokingCessationRawSchema, [
        { 醫事機構類別: "診所", 地址: "臺北市中正區中山南路7號", 電話: "", 郵遞區號: "", 給藥: "V", 衛教: "" },
      ]),
    /field "院所名稱"/,
  );
});

test("hpaSmokingCessationRawSchema: throws if 給藥 is renamed/removed upstream (the field this ticket exists to surface)", () => {
  assert.throws(
    () =>
      validateImportRows("HPA smoking-cessation facilities (6954)", hpaSmokingCessationRawSchema, [
        { 醫事機構類別: "診所", 院所名稱: "某診所", 地址: "某地址", 電話: "", 郵遞區號: "", 衛教: "" },
      ]),
    /field "給藥"/,
  );
});

test("hpaSmokingCessationRawSchema: tolerates a row with every optional field legitimately blank", () => {
  assert.doesNotThrow(() =>
    validateImportRows("HPA smoking-cessation facilities (6954)", hpaSmokingCessationRawSchema, [
      { 醫事機構類別: "衛生所", 院所名稱: "某衛生所", 電話: "", 郵遞區號: "", 地址: "某地址", 給藥: "", 衛教: "" },
    ]),
  );
});

test("buildHpaSmokingCessationSourceId: produces a stable compound key {name}|{address}", () => {
  assert.equal(
    buildHpaSmokingCessationSourceId("國立臺灣大學醫學院附設醫院", "臺北市中正區中山南路7號"),
    "國立臺灣大學醫學院附設醫院|臺北市中正區中山南路7號",
  );
});

test("buildHpaSmokingCessationSourceId: handles a null/empty address gracefully", () => {
  assert.equal(buildHpaSmokingCessationSourceId("某診所", null), "某診所|");
  assert.equal(buildHpaSmokingCessationSourceId("某診所", undefined), "某診所|");
  assert.equal(buildHpaSmokingCessationSourceId("某診所", ""), "某診所|");
});

test("buildHpaSmokingCessationSourceId: trims whitespace and enforces the 100-character cap", () => {
  const longName = "A".repeat(80);
  const longAddress = "B".repeat(80);
  const sourceId = buildHpaSmokingCessationSourceId(`  ${longName}  `, `  ${longAddress}  `);
  assert.ok(sourceId.length <= 100);
  assert.equal(sourceId, `${longName}|${"B".repeat(19)}`);
});
