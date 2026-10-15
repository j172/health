// Unit tests for lib/server/facilities/csv.ts — run with `npm test`.
//
// Same resolve-hook setup as lib/server/db/coords.test.mjs: node:test +
// node:assert only, no framework. Lets this .mjs test import the TypeScript
// source directly instead of duplicating its logic.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + extension, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { decodeBig5, parseCsv, iterateCsvRows, normalizeUnitName } = await import("./csv.ts");

// Real Big5-encoded bytes (header + 3 data rows) taken from MOHW's actual
// 全國身心障礙福利機構一覽表 open-data CSV — not a synthetic string — so this
// test exercises the real byte patterns (institution names, addresses) the
// production import scripts decode. See issue #479: the point of this test
// is to pin the exact decode output of the `TextDecoder("big5")` swap that
// replaced `iconv-lite`, confirmed byte-for-byte identical to iconv-lite's
// output on this same sample before the swap (verified manually, since
// iconv-lite is no longer a dependency to compare against at test time).
const fixturePath = new URL("./__fixtures__/mohw-disability-welfare-sample.csv", import.meta.url);
const fixtureBuffer = readFileSync(fixturePath);

const EXPECTED_DECODED =
  "機構名稱,縣市,鄉鎮市區,地址,連絡電話,機構類型,核定服務人數(住宿),核定服務人數(夜間),核定服務人數(日間),實際服務人數(住宿),實際服務人數(夜間),實際服務人數(日間),評鑑屆次,最近1次評鑑等第\r\n" +
  "新北市政府委託社團法人台北市康復之友協會辦理新北市慈芳關懷中心,新北市,土城區,新北市土城區中正路18號6樓,02-82621305,福利服務中心,0,0,0,0,0,0,免評鑑,免評鑑\r\n" +
  "新北市政府社會局委託天主教耕莘醫療財團法人永和耕莘醫院辦理新北市愛維養護中心,新北市,八里區,新北市八里區華富山35號,02-86304104,全日型住宿式機構,173,0,0,154,0,0,11,優\r\n" +
  "新北市政府社會局委託社團法人新北市自閉症服務協進會辦理新北市自閉症潛能發展中心,新北市,三重區,新北市三重區溪尾街73號1樓,02-29822558,日間型機構,0,0,15,0,0,12,11,甲\r\n";

test("decodeBig5 output on a real MOHW Big5 CSV sample is byte-for-byte unchanged from the iconv-lite implementation", () => {
  assert.equal(decodeBig5(fixtureBuffer), EXPECTED_DECODED);
});

test("decodeBig5 handles a Buffer (not just Uint8Array) — the type the import scripts actually pass", () => {
  assert.ok(Buffer.isBuffer(fixtureBuffer));
  const decoded = decodeBig5(fixtureBuffer);
  assert.equal(typeof decoded, "string");
  assert.equal(decoded.length, EXPECTED_DECODED.length);
});

test("decodeBig5's output still parses into the expected rows via parseCsv", () => {
  const rows = parseCsv(decodeBig5(fixtureBuffer));
  assert.equal(rows.length, 3);
  assert.equal(rows[0]["機構名稱"], "新北市政府委託社團法人台北市康復之友協會辦理新北市慈芳關懷中心");
  assert.equal(rows[0]["地址"], "新北市土城區中正路18號6樓");
  assert.equal(rows[1]["評鑑屆次"], "11");
  assert.equal(rows[2]["鄉鎮市區"], "三重區");
});

// issue #613: New Taipei's 125231 joint-assessment-center source wraps a
// long institution name across two CSV lines inside one quoted cell
// (confirmed live, e.g. "國泰醫療財團法人\n汐止國泰綜合醫院") — collapses to
// no space (not one), since Chinese org names never have a meaningful
// space of their own.
test("normalizeUnitName: collapses an embedded line break (real 125231 sample) with no inserted space", () => {
  assert.equal(normalizeUnitName("國泰醫療財團法人\n汐止國泰綜合醫院"), "國泰醫療財團法人汐止國泰綜合醫院");
});

test("normalizeUnitName: trims leading/trailing whitespace", () => {
  assert.equal(normalizeUnitName("  新北市立土城醫院  "), "新北市立土城醫院");
});

test("normalizeUnitName: a name with no whitespace at all passes through unchanged", () => {
  assert.equal(normalizeUnitName("中英醫療社團法人板英醫院"), "中英醫療社團法人板英醫院");
});

// issue #674: iterateCsvRows is the streaming core parseCsv is built on (the 新北
// garbage-route sync reads 26.6k rows through it without materialising them).
test("iterateCsvRows: yields untrimmed cell arrays one row at a time; quotes, doubled quotes, embedded commas/newlines, CRLF", () => {
  const text = 'a,b,c\r\n1, "x,y" ,"he said ""hi"""\r\n"two\nlines",,\r\n';
  assert.deepEqual([...iterateCsvRows(text)], [
    ["a", "b", "c"],
    ["1", " x,y ", 'he said "hi"'],
    ["two\nlines", "", ""],
  ]);
});

test("iterateCsvRows: skips blank lines, strips a leading BOM, and keeps a final row that has no trailing newline", () => {
  assert.deepEqual([...iterateCsvRows("﻿h1,h2\n\n  \nv1,v2")], [["h1", "h2"], ["v1", "v2"]]);
  assert.deepEqual([...iterateCsvRows("")], []);
  assert.deepEqual([...iterateCsvRows("\n\n")], []);
});

test("iterateCsvRows: is lazy — the first row is available without scanning (or even finishing) the rest", () => {
  const iterator = iterateCsvRows('a,b\n"never closed');
  assert.deepEqual(iterator.next().value, ["a", "b"]);
  // The unterminated quote is only reached on the next pull and still resolves to a row, not a throw.
  assert.deepEqual(iterator.next().value, ["never closed"]);
  assert.equal(iterator.next().done, true);
});

test("iterateCsvRows: a stray quote inside an unquoted cell toggles quoting (long-standing dialect), and \\r outside quotes is dropped", () => {
  assert.deepEqual([...iterateCsvRows('ab"c,d"e,f\rg\n')], [["abc,de", "fg"]]);
});

// parseCsv was rewritten from a character-at-a-time loop to this slice-based
// iterator (issue #674: it holds 26.6k rows x 29 cells in memory otherwise). The
// reference below is the previous implementation, verbatim; every source in the
// repo relies on its exact dialect, so the new one must agree on any input.
function legacyParseCsv(text) {
  const cleaned = text.replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inQuotes) {
      if (char === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r") {
      // skip
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.length > 1 || (r[0] ?? "").trim() !== "");
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0].map((h) => h.trim());
  return nonEmptyRows.slice(1).map((cells) => {
    const record = {};
    headers.forEach((h, i) => (record[h] = (cells[i] ?? "").trim()));
    return record;
  });
}

test("parseCsv: agrees with the previous character-by-character implementation on 6,000 random inputs and the real fixtures", () => {
  // Alphabet chosen to hit every state-machine edge: quotes (often adjacent), commas,
  // CR/LF, blanks, a BOM mid-text, a tab, ASCII and CJK.
  const alphabet = ['"', '"', ",", ",", "\r", "\n", "\n", "a", "b", " ", "中", "﻿", "\t"];
  let seed = 20261016;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let n = 0; n < 6000; n++) {
    const length = n % 10 === 0 ? 40 + Math.floor(random() * 300) : Math.floor(random() * 24);
    let text = "";
    for (let i = 0; i < length; i++) text += alphabet[Math.floor(random() * alphabet.length)];
    assert.deepEqual(parseCsv(text), legacyParseCsv(text), `input ${JSON.stringify(text)}`);
  }

  for (const name of ["mohw-disability-welfare-sample.csv", "ntpc-joint-assessment-125231-sample.csv", "smoking-cessation-ntpc-124244-sample.csv"]) {
    const text = readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf-8");
    assert.deepEqual(parseCsv(text), legacyParseCsv(text), name);
  }
  const big = readFileSync(new URL("./__fixtures__/mohw-disability-welfare-sample.csv", import.meta.url));
  assert.deepEqual(parseCsv(decodeBig5(big)), legacyParseCsv(decodeBig5(big)));
});
