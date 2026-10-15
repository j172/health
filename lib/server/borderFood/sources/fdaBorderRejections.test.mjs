// Parser tests for the FDA 邊境查驗不合格食品 dataset (data.gov.tw 6133, issue
// #671 / docs/2.0/track-b-opendata-phase2-3-spec.md §2.1 A-3, §5). Per the
// repo's testing convention there is no live-network test here: the parser is
// a pure (text | buffer) -> records function exercised against a small real
// sample (`__fixtures__/fda-6133-sample.json`, 14 rows picked from the live
// file on 2026-10-15) plus hand-built edge cases.
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

const { parseBorderRejections, BORDER_FOOD_SOURCE_KEY } = await import("./fdaBorderRejections.ts");
const { splitRejectionReasons } = await import("../reasons.ts");

const fixturePath = new URL("../__fixtures__/fda-6133-sample.json", import.meta.url);
const fixtureText = readFileSync(fixturePath, "utf-8");
const fixtureRows = JSON.parse(fixtureText);
const NOW = new Date("2026-10-15T00:00:00Z");

const parseFixture = () => parseBorderRejections(fixtureText, { now: NOW });

test("source key identifies the dataset", () => {
  assert.equal(BORDER_FOOD_SOURCE_KEY, "fda_6133");
});

test("fixture is the real upstream shape: 14 rows with the 17 documented columns, no BOM", () => {
  assert.equal(fixtureRows.length, 14);
  assert.equal(readFileSync(fixturePath)[0], 0x5b); // '[' — plain JSON, not ZIP/BOM
  for (const row of fixtureRows) {
    for (const column of ["產地", "主旨", "原因", "進口商名稱", "進口商地址", "附圖", "發布日期", "報驗受理日期"]) {
      assert.ok(column in row, `fixture row is missing column ${column}`);
    }
  }
});

test("parseBorderRejections: merges fully-identical rows (differing only in 附圖) into one record with duplicateCount", () => {
  const { records, rawRowCount, mergedDuplicateRows } = parseFixture();
  assert.equal(rawRowCount, 14);
  // 411/412 (櫻桃, 2023-03-01) and 722/2166 (新鮮夏季黑松露, 2026-06-16) are two identical pairs.
  assert.equal(records.length, 12);
  assert.equal(mergedDuplicateRows, 2);
  const merged = records.filter((r) => r.duplicateCount > 1);
  assert.equal(merged.length, 2);
  assert.deepEqual(
    merged.map((r) => [r.subject, r.duplicateCount]).sort(),
    [
      ["新鮮夏季黑松露", 2],
      ["櫻桃", 2],
    ],
  );
  // every other record is a singleton
  assert.ok(records.filter((r) => r.duplicateCount === 1).length === 10);
  // total rows represented is conserved
  assert.equal(
    records.reduce((sum, r) => sum + r.duplicateCount, 0),
    14,
  );
});

test("parseBorderRejections: never outputs the importer address or the attached image (issue #671 hard requirement)", () => {
  const { records } = parseFixture();
  const serialized = JSON.stringify(records);

  for (const row of fixtureRows) {
    assert.ok(!serialized.includes(row["進口商地址"]), `importer address leaked: ${row["進口商地址"]}`);
    assert.ok(!serialized.includes(row["附圖"]), `image URL leaked: ${row["附圖"]}`);
  }
  assert.ok(!/GetFile\.ashx|fda\.gov\.tw\/TC\/includes/.test(serialized));

  for (const record of records) {
    for (const key of Object.keys(record)) {
      assert.ok(!/address|image|photo|附圖|地址/i.test(key), `record carries a forbidden field: ${key}`);
    }
  }
});

test("parseBorderRejections: converts YYYY/MM/DD to ISO dates, earliest and latest rows included", () => {
  const { records } = parseFixture();
  const dates = records.map((r) => r.publishedOn);
  assert.ok(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  assert.equal(records[0].publishedOn, "2023-01-03");
  assert.equal(records[0].inspectionAcceptedOn, "2022-11-30");
  assert.equal(records.at(-1).publishedOn, "2026-10-13");
});

test("parseBorderRejections: carries the displayed fields through (first fixture row)", () => {
  const { records } = parseFixture();
  const first = records[0];
  assert.equal(first.originCountry, "中國大陸");
  assert.equal(first.subject, "奶油刮刀");
  assert.equal(first.reason, "容器具-溶出試驗不符規定");
  assert.equal(first.importerName, "金樂客餐飲國際有限公司");
  assert.equal(first.hsCode, "3924.10.00.90-6");
  assert.equal(first.manufacturerName, "肇庆高新区强宏塑料模具有限公司");
  assert.equal(first.weight, "16.00 PCE(1.76 )");
  assert.equal(first.disposition, "案內不符合商品依規定退運或銷毀。");
  assert.match(first.detail, /蒸發殘渣值76 ppm/);
  assert.match(first.legalLimit, /食品安全衛生管理法第17條/);
  assert.equal(first.duplicateCount, 1);
});

test("parseBorderRejections: empty strings become null and a null 檢驗方法 row is kept, not dropped", () => {
  const { records } = parseFixture();
  const noMethod = fixtureRows.find((r) => r["檢驗方法"] === null || r["檢驗方法"] === "");
  assert.ok(noMethod, "fixture should include the one upstream row with a null 檢驗方法");
  const record = records.find((r) => r.subject === noMethod["主旨"] && r.publishedOn === noMethod["發布日期"].replace(/\//g, "-"));
  assert.ok(record);
  assert.equal(record.inspectionMethod, null);
  // 牌名 is "" for the first row -> null, not an empty string
  assert.equal(records[0].brandName, null);
});

test("parseBorderRejections: trims whitespace (including full-width spaces) from text fields", () => {
  const { records } = parseFixture();
  for (const record of records) {
    for (const value of [record.reason, record.originCountry, record.subject, record.importerName, record.brandName]) {
      if (value !== null) assert.equal(value, value.trim());
      if (value !== null) assert.ok(!/　/.test(value));
    }
  }
  // the fixture contains a reason with a trailing space upstream ("含非法定著色劑 ")
  assert.ok(fixtureRows.some((r) => r["原因"] !== r["原因"].trim()));
});

test("parseBorderRejections: row hash is a stable 64-hex digest, distinct per distinct row, independent of column order", () => {
  const first = fixtureRows[0];
  const reordered = Object.fromEntries(Object.entries(first).reverse());
  const a = parseBorderRejections(JSON.stringify([first]), { now: NOW }).records[0];
  const b = parseBorderRejections(JSON.stringify([reordered]), { now: NOW }).records[0];
  assert.match(a.rowHash, /^[0-9a-f]{64}$/);
  assert.equal(a.rowHash, b.rowHash);

  const { records } = parseFixture();
  assert.equal(new Set(records.map((r) => r.rowHash)).size, records.length);
});

test("parseBorderRejections: row hash ignores the two excluded columns (address, image) and the upstream-only manufacturer code", () => {
  const base = fixtureRows[0];
  const hashOf = (row) => parseBorderRejections(JSON.stringify([row]), { now: NOW }).records[0].rowHash;
  assert.equal(hashOf(base), hashOf({ ...base, 進口商地址: "完全不同的地址", 附圖: "https://example.invalid/x.jpg", 製造商代碼: "ZZ" }));
  assert.notEqual(hashOf(base), hashOf({ ...base, 發布日期: "2023/01/04" }));
  assert.notEqual(hashOf(base), hashOf({ ...base, 重量: "1.00 KGM" }));
});

test("parseBorderRejections: re-parsing is idempotent (same hashes, same order)", () => {
  const one = parseFixture().records.map((r) => r.rowHash);
  const two = parseFixture().records.map((r) => r.rowHash);
  assert.deepEqual(one, two);
});

test("parseBorderRejections: implausible or impossible dates become null instead of throwing (1911 placeholder, 2819 typo, Feb 30)", () => {
  const base = fixtureRows[0];
  const rows = [
    { ...base, 主旨: "a", 發布日期: "1911/01/01" },
    { ...base, 主旨: "b", 發布日期: "2819/11/18" },
    { ...base, 主旨: "c", 發布日期: "2023/02/30" },
    { ...base, 主旨: "d", 發布日期: "2027/10/01" }, // > today + 1 year relative to NOW? (2026-10-15 + 1y = 2027-10-15, so this one is allowed)
    { ...base, 主旨: "e", 發布日期: "2028/10/01" }, // beyond today + 1 year
    { ...base, 主旨: "f", 發布日期: "" },
    { ...base, 主旨: "g", 發布日期: "2024/3/5" },
  ];
  const { records } = parseBorderRejections(JSON.stringify(rows), { now: NOW });
  const bySubject = Object.fromEntries(records.map((r) => [r.subject, r.publishedOn]));
  assert.equal(bySubject.a, null);
  assert.equal(bySubject.b, null);
  assert.equal(bySubject.c, null);
  assert.equal(bySubject.d, "2027-10-01");
  assert.equal(bySubject.e, null);
  assert.equal(bySubject.f, null);
  assert.equal(bySubject.g, "2024-03-05");
});

test("parseBorderRejections: rows missing an identity field (產地 / 主旨 / 原因) are skipped and counted, not fatal", () => {
  const base = fixtureRows[0];
  const rows = [base, { ...base, 主旨: "" }, { ...base, 產地: null, 主旨: "x" }, { ...base, 原因: "  ", 主旨: "y" }];
  const result = parseBorderRejections(JSON.stringify(rows), { now: NOW });
  assert.equal(result.records.length, 1);
  assert.equal(result.skippedRowCount, 3);
  assert.equal(result.rawRowCount, 4);
});

test("parseBorderRejections: accepts a UTF-8 BOM and a Buffer", () => {
  const withBom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(fixtureText, "utf-8")]);
  assert.equal(parseBorderRejections(withBom, { now: NOW }).records.length, 12);
  assert.equal(parseBorderRejections(`﻿${fixtureText}`, { now: NOW }).records.length, 12);
});

test("parseBorderRejections: detects a ZIP-wrapped response by its PK header, not by URL (the data.fda.gov.tw family serves both)", () => {
  const zip = new AdmZip();
  zip.addFile("52.json", Buffer.from(fixtureText, "utf-8"));
  const zipped = zip.toBuffer();
  assert.equal(zipped[0], 0x50);
  assert.equal(zipped[1], 0x4b);
  const result = parseBorderRejections(zipped, { now: NOW });
  assert.equal(result.records.length, 12);
  assert.deepEqual(
    result.records.map((r) => r.rowHash),
    parseFixture().records.map((r) => r.rowHash),
  );
});

test("parseBorderRejections: a ZIP with no .json entry fails loudly", () => {
  const zip = new AdmZip();
  zip.addFile("readme.txt", Buffer.from("nope"));
  assert.throws(() => parseBorderRejections(zip.toBuffer(), { now: NOW }), /no \.json entry/i);
});

test("parseBorderRejections: an empty array parses to zero records (the sync layer, not the parser, decides that is an error)", () => {
  const result = parseBorderRejections("[]", { now: NOW });
  assert.deepEqual(result.records, []);
  assert.equal(result.rawRowCount, 0);
});

test("parseBorderRejections: a non-array payload or a dataset with a renamed critical column throws (schema drift must be loud)", () => {
  assert.throws(() => parseBorderRejections('{"error":"nope"}', { now: NOW }), /expected an array/i);
  const renamed = fixtureRows.map(({ 原因, ...rest }) => ({ ...rest, 事由: 原因 }));
  assert.throws(() => parseBorderRejections(JSON.stringify(renamed), { now: NOW }), /schema validation failed/i);
});

test("parseBorderRejections: HTML or other garbage throws a readable error rather than a raw SyntaxError position dump", () => {
  assert.throws(() => parseBorderRejections("<html>blocked</html>", { now: NOW }), /not valid JSON/i);
});

test("splitRejectionReasons: splits the '&'-joined multi-reason strings and trims", () => {
  assert.deepEqual(splitRejectionReasons("農藥殘留含量不符規定"), ["農藥殘留含量不符規定"]);
  assert.deepEqual(splitRejectionReasons("含非法定著色劑 & 農藥殘留含量不符規定"), ["含非法定著色劑", "農藥殘留含量不符規定"]);
  assert.deepEqual(splitRejectionReasons("防腐劑含量不符規定&抗氧化劑含量不符規定"), ["防腐劑含量不符規定", "抗氧化劑含量不符規定"]);
  assert.deepEqual(splitRejectionReasons(" "), []);
  assert.deepEqual(splitRejectionReasons(null), []);
});
