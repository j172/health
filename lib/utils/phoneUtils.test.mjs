import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanTelUri, formatDisplayPhone } from "./phoneUtils.mjs";

test("cleanTelUri: 空值與無效輸入安全回傳 null", () => {
  assert.equal(cleanTelUri(null), null);
  assert.equal(cleanTelUri(undefined), null);
  assert.equal(cleanTelUri(""), null);
  assert.equal(cleanTelUri("   "), null);
  assert.equal(cleanTelUri("無電話"), null);
  assert.equal(cleanTelUri("暫無提供"), null);
  assert.equal(cleanTelUri("12"), null, "少於3碼之數字視為無效");
});

test("cleanTelUri: 標準台灣市話與手機號碼轉換", () => {
  assert.equal(cleanTelUri("02-29991234"), "tel:0229991234");
  assert.equal(cleanTelUri("(02) 2999-1234"), "tel:0229991234");
  assert.equal(cleanTelUri("04-23456789"), "tel:0423456789");
  assert.equal(cleanTelUri("07-1234567"), "tel:071234567");
  assert.equal(cleanTelUri("0912-345-678"), "tel:0912345678");
  assert.equal(cleanTelUri("0912345678"), "tel:0912345678");
});

test("cleanTelUri: 多支電話以斜線、頓號或分號分隔時，取第一支主要代表號", () => {
  assert.equal(cleanTelUri("02-29991234 / 02-29995678"), "tel:0229991234");
  assert.equal(cleanTelUri("02-29991234、02-29995678"), "tel:0229991234");
  assert.equal(cleanTelUri("02-29991234; 02-29995678"), "tel:0229991234");
  assert.equal(cleanTelUri("04-22223333/4444"), "tel:0422223333");
});

test("cleanTelUri: 分機標註（轉、分機、#、ext）自動截取主要號碼", () => {
  assert.equal(cleanTelUri("02-29829111轉123"), "tel:0229829111");
  assert.equal(cleanTelUri("02-29829111 分機45"), "tel:0229829111");
  assert.equal(cleanTelUri("02-29829111#67"), "tel:0229829111");
  assert.equal(cleanTelUri("02-29829111 ext.89"), "tel:0229829111");
});

test("cleanTelUri: 全形字元與括號正確轉為半形標準格式", () => {
  assert.equal(cleanTelUri("（０２）２９９９１２３４"), "tel:0229991234");
  assert.equal(cleanTelUri("０９１２－３４５－６７８"), "tel:0912345678");
});

test("cleanTelUri: 緊急簡短號碼與國際碼正確處理", () => {
  assert.equal(cleanTelUri("110"), "tel:110");
  assert.equal(cleanTelUri("119"), "tel:119");
  assert.equal(cleanTelUri("1999"), "tel:1999");
  assert.equal(cleanTelUri("+886-2-29991234"), "tel:+886229991234");
});

test("formatDisplayPhone: 保留第一支易讀號碼與修飾空白", () => {
  assert.equal(formatDisplayPhone(null), null);
  assert.equal(formatDisplayPhone(""), null);
  assert.equal(formatDisplayPhone("02-29991234 / 02-29995678"), "02-29991234");
  assert.equal(formatDisplayPhone("02-29991234轉123 / 02-29995678"), "02-29991234轉123");
  assert.equal(formatDisplayPhone("（０２）２９９９－１２３４"), "(02)2999-1234");
});

