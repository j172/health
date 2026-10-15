// Issue #673 (Track B B-13): 台水「用戶水質資訊公開」(data.gov.tw 36605) 鄉鎮
// 總硬度。parser + 查詢結果判定都是純函式，不連真實 MySQL／網路——fixture
// 是 2026-10-15 從 https://www.water.gov.tw/opendata/qual5.csv 實際下載的
// 全檔（340 列、16.8 KB、含 BOM、CRLF），不是手寫的樣本。
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

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

const { parseWaterHardness } = await import("./hardness.ts");
const {
  classifyHardness,
  resolveHardnessLookup,
  summarizeHardnessByCounty,
  TAIWAN_WATER_UNSERVED_COUNTIES,
  NOT_IN_TAIWAN_WATER_HEADLINE,
} = await import("./hardnessLookup.ts");
const { TAIWAN_COUNTIES } = await import("../../constants/taiwanDistricts.ts");

const fixtureUrl = new URL("./__fixtures__/qual5-water-hardness.csv", import.meta.url);
const fixtureBuffer = readFileSync(fileURLToPath(fixtureUrl));
const fixtureText = fixtureBuffer.toString("utf-8");
const rows = parseWaterHardness(fixtureText);

const HEADER = "檢驗項目,縣市別,鄉鎮市區別,檢驗數值,單位";

// ---------------------------------------------------------------- parser --

test("fixture really is the BOM-prefixed file the upstream serves (guards the BOM test below from silently testing nothing)", () => {
  assert.deepEqual([...fixtureBuffer.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
});

test("parseWaterHardness: the real file yields all 340 rows (spec §5 D-3) despite the BOM on its header", () => {
  assert.equal(rows.length, 340);
});

test("parseWaterHardness: the real file covers exactly the 19 counties the spec documents — not 臺北市, 金門縣 or 連江縣", () => {
  const counties = new Set(rows.map((r) => r.county));
  assert.equal(counties.size, 19);
  for (const unserved of ["臺北市", "金門縣", "連江縣"]) {
    assert.ok(!counties.has(unserved), `${unserved} must not appear in the dataset`);
  }
  for (const county of counties) {
    assert.ok(TAIWAN_COUNTIES.includes(county), `${county} is not a canonical county name`);
  }
});

test("parseWaterHardness: maps columns and keeps file order (first and last real rows)", () => {
  assert.deepEqual(rows[0], { county: "新北市", district: "板橋區", hardnessMgPerL: 72.9, unit: "毫克/公升" });
  assert.deepEqual(rows.at(-1), { county: "澎湖縣", district: "七美鄉", hardnessMgPerL: 166, unit: "毫克/公升" });
});

test("parseWaterHardness: values are numbers within the real range, and (county, district) is unique so the DB upsert key never collapses rows", () => {
  const values = rows.map((r) => r.hardnessMgPerL);
  assert.ok(values.every((v) => typeof v === "number" && Number.isFinite(v)));
  assert.equal(Math.min(...values), 22.5);
  assert.equal(Math.max(...values), 294);
  assert.equal(new Set(rows.map((r) => `${r.county}|${r.district}`)).size, rows.length);
});

test("parseWaterHardness: a BOM + CRLF string (what httpGetText hands back for the real file) parses the same as plain LF", () => {
  const lf = `${HEADER}\n總硬度,臺中市,中區,111,毫克/公升\n`;
  const bomCrlf = `﻿${HEADER}\r\n總硬度,臺中市,中區,111,毫克/公升\r\n`;
  assert.deepEqual(parseWaterHardness(bomCrlf), parseWaterHardness(lf));
  assert.equal(parseWaterHardness(bomCrlf).length, 1);
});

test("parseWaterHardness: normalises 台→臺 in the county name so lookups and the DB key stay on one spelling", () => {
  const parsed = parseWaterHardness(`${HEADER}\n總硬度,台中市,中區,111,毫克/公升\n總硬度,台東縣,臺東市,215,毫克/公升\n`);
  assert.deepEqual(parsed.map((r) => r.county), ["臺中市", "臺東縣"]);
});

test("parseWaterHardness: only 總硬度 rows are kept — a future second test item must not collapse into the same (county, district) key", () => {
  const parsed = parseWaterHardness(`${HEADER}\n總硬度,臺中市,中區,111,毫克/公升\n總鹼度,臺中市,中區,80,毫克/公升\n`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].hardnessMgPerL, 111);
});

test("parseWaterHardness: rows with a blank county/district or a non-numeric value are dropped, not thrown on or turned into 0", () => {
  const parsed = parseWaterHardness(
    [
      HEADER,
      "總硬度,,中區,111,毫克/公升",
      "總硬度,臺中市,,111,毫克/公升",
      "總硬度,臺中市,東區,ND,毫克/公升",
      "總硬度,臺中市,南區,,毫克/公升",
      "總硬度,臺中市,西區,-5,毫克/公升",
      "總硬度,臺中市,北區,123.4,毫克/公升",
      "",
    ].join("\n"),
  );
  assert.deepEqual(parsed.map((r) => `${r.district}:${r.hardnessMgPerL}`), ["北區:123.4"]);
});

test("parseWaterHardness: a repeated (county, district) collapses to the last row rather than producing two rows for one DB key", () => {
  const parsed = parseWaterHardness(`${HEADER}\n總硬度,臺中市,中區,100,毫克/公升\n總硬度,臺中市,中區,111,毫克/公升\n`);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].hardnessMgPerL, 111);
});

test("parseWaterHardness: empty text, header-only text and an HTML error page served with HTTP 200 all give [] (the sync treats [] as a failed fetch)", () => {
  assert.deepEqual(parseWaterHardness(""), []);
  assert.deepEqual(parseWaterHardness(`${HEADER}\n`), []);
  assert.deepEqual(parseWaterHardness("<html><body>Service Unavailable</body></html>"), []);
});

// -------------------------------------------------------- classification --

test("classifyHardness: USGS bands (soft ≤60, moderately hard ≤120, hard ≤180, very hard above) with the boundary values on the lower band", () => {
  const key = (v) => classifyHardness(v).key;
  assert.equal(key(22.5), "soft");
  assert.equal(key(60), "soft");
  assert.equal(key(60.1), "moderate");
  assert.equal(key(120), "moderate");
  assert.equal(key(120.1), "hard");
  assert.equal(key(180), "hard");
  assert.equal(key(180.1), "very-hard");
  assert.equal(key(294), "very-hard");
});

test("classifyHardness: every band has a Chinese label", () => {
  assert.deepEqual(
    [20, 100, 150, 250].map((v) => classifyHardness(v).label),
    ["軟水", "中度硬水", "硬水", "極硬水"],
  );
});

// ----------------------------------------------------------------- lookup --

test("resolveHardnessLookup: 臺北市 is explicitly 'not in 台水 supply area' with the supplier named — never blank, even before any sync has filled the table", () => {
  for (const county of ["臺北市", "台北市", " 臺北市 "]) {
    for (const data of [rows, []]) {
      const result = resolveHardnessLookup(data, county);
      assert.equal(result.kind, "not-in-taiwan-water-area", `${county} (${data.length} rows)`);
      assert.equal(result.county, "臺北市");
      assert.equal(result.headline, NOT_IN_TAIWAN_WATER_HEADLINE);
      assert.equal(NOT_IN_TAIWAN_WATER_HEADLINE, "不在台水轄區");
      assert.match(result.message, /不在台水轄區/);
      assert.match(result.message, /臺北自來水事業處/);
    }
  }
});

test("resolveHardnessLookup: choosing a 臺北市 district (which the dataset has no rows for) still gets the supply-area message, not a 'district not found'", () => {
  const result = resolveHardnessLookup(rows, "臺北市", "大安區");
  assert.equal(result.kind, "not-in-taiwan-water-area");
});

test("resolveHardnessLookup: the message says missing data is not a verdict on water quality (the spec's 'not-found ≠ bad water' rule)", () => {
  const { message } = resolveHardnessLookup(rows, "臺北市");
  assert.match(message, /不代表/);
});

test("resolveHardnessLookup: 金門縣 and 連江縣 get the same explicit message with their own supplier", () => {
  const kinmen = resolveHardnessLookup(rows, "金門縣");
  const lienchiang = resolveHardnessLookup(rows, "連江縣");
  assert.equal(kinmen.kind, "not-in-taiwan-water-area");
  assert.equal(lienchiang.kind, "not-in-taiwan-water-area");
  assert.match(kinmen.message, /金門縣自來水廠/);
  assert.match(lienchiang.message, /連江縣自來水廠/);
});

test("TAIWAN_WATER_UNSERVED_COUNTIES lists exactly the three counties absent from the real file, and every one is a canonical county", () => {
  assert.deepEqual(
    TAIWAN_WATER_UNSERVED_COUNTIES.map((c) => c.county).sort(),
    ["臺北市", "連江縣", "金門縣"].sort(),
  );
  const present = new Set(rows.map((r) => r.county));
  for (const { county, supplier } of TAIWAN_WATER_UNSERVED_COUNTIES) {
    assert.ok(TAIWAN_COUNTIES.includes(county));
    assert.ok(!present.has(county));
    assert.ok(supplier.length > 0);
  }
  // Every canonical county is either in the dataset or explicitly flagged — no third, silent category.
  const flagged = new Set(TAIWAN_WATER_UNSERVED_COUNTIES.map((c) => c.county));
  for (const county of TAIWAN_COUNTIES) {
    assert.ok(present.has(county) || flagged.has(county), `${county} is neither in the dataset nor flagged as unserved`);
  }
});

test("resolveHardnessLookup: a served county lists its districts with min/max; the 台 spelling resolves the same", () => {
  const result = resolveHardnessLookup(rows, "臺中市");
  assert.equal(result.kind, "county");
  assert.equal(result.county, "臺中市");
  assert.equal(result.rows.length, 29);
  assert.equal(result.min, Math.min(...result.rows.map((r) => r.hardnessMgPerL)));
  assert.equal(result.max, Math.max(...result.rows.map((r) => r.hardnessMgPerL)));
  assert.deepEqual(resolveHardnessLookup(rows, "台中市"), result);
});

test("resolveHardnessLookup: a district inside a served county returns its row plus the band", () => {
  const result = resolveHardnessLookup(rows, "新北市", "板橋區");
  assert.equal(result.kind, "district");
  assert.equal(result.row.hardnessMgPerL, 72.9);
  assert.equal(result.hardnessClass.key, "moderate");
});

test("resolveHardnessLookup: a district the dataset doesn't list (新北市新店區 is absent from the real file) says so instead of rendering blank", () => {
  const result = resolveHardnessLookup(rows, "新北市", "新店區");
  assert.equal(result.kind, "district-not-listed");
  assert.match(result.message, /新店區/);
  assert.match(result.message, /不代表/);
});

test("resolveHardnessLookup: before the first sync (empty table) a served county reports 'no data yet' rather than 'not found'", () => {
  assert.equal(resolveHardnessLookup([], "臺中市").kind, "no-data");
});

test("resolveHardnessLookup: an unrecognised county name is reported as such", () => {
  assert.equal(resolveHardnessLookup(rows, "火星市").kind, "unknown-county");
});

test("resolveHardnessLookup: no county chosen yields the nationwide overview", () => {
  const result = resolveHardnessLookup(rows, "");
  assert.equal(result.kind, "overview");
  assert.equal(result.counties.length, 19);
  assert.equal(result.total, 340);
});

test("summarizeHardnessByCounty: one entry per county with count, min and max", () => {
  const summary = summarizeHardnessByCounty(rows);
  assert.equal(summary.length, 19);
  assert.equal(summary.reduce((sum, c) => sum + c.count, 0), 340);
  const taichung = summary.find((c) => c.county === "臺中市");
  assert.equal(taichung.count, 29);
  assert.ok(taichung.min <= taichung.max);
});
