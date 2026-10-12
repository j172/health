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

const { decodeBig5, parseCsv } = await import("./csv.ts");

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
