import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

const { parseModa165027Json, moda165027RawSchema, MODA_165027_SOURCE_KEY } = await import(
  "./moda165027.ts"
);
const { validateImportRows } = await import("../../validation/importSchema.ts");

const fixturePath = new URL("../__fixtures__/moda-165027-sample.json", import.meta.url);
const fixtureRows = JSON.parse(readFileSync(fixturePath, "utf-8"));

test("parseModa165027Json: parses a real recorded sample into structured records", () => {
  // 6 rows recorded live from www-api.moda.gov.tw on 2026-10-14 — see
  // __fixtures__/moda-165027-sample.json.
  const records = parseModa165027Json(fixtureRows);
  assert.equal(records.length, 6);

  for (const record of records) {
    assert.equal(record.source, MODA_165027_SOURCE_KEY);
    assert.ok(record.domain.length > 0);
    assert.equal(record.siteNature, null);
    assert.ok(record.fraudDescription);
    assert.match(record.reportedYearMonth, /^\d{8}$/);
  }
});

test("parseModa165027Json: normalizes 網域名稱 (lower-case, matches checkSuspiciousUrl's normalization)", () => {
  const records = parseModa165027Json(fixtureRows);
  const domains = records.map((r) => r.domain);
  assert.ok(domains.includes("tobuyersepc24.com"));
  assert.ok(domains.includes("sharefunpc24.com"));
});

test("parseModa165027Json: a non-ASCII (confusable Unicode) domain is punycode-normalized", () => {
  const records = parseModa165027Json(fixtureRows);
  const domains = records.map((r) => r.domain);
  // "xįn-stars.com" (Latin-extended 'į', not plain ASCII) must come out
  // punycode-encoded, same as checkSuspiciousUrl would do for a user pasting it.
  assert.ok(!domains.includes("xįn-stars.com"));
  assert.ok(domains.some((d) => d.startsWith("xn--")));
});

test("parseModa165027Json: an already-punycode domain passes through unchanged", () => {
  const records = parseModa165027Json(fixtureRows);
  const domains = records.map((r) => r.domain);
  assert.ok(domains.includes("xn--xn-stars-bkb.com"));
});

test("parseModa165027Json: a subdomain is preserved exactly, not collapsed", () => {
  const records = parseModa165027Json(fixtureRows);
  const domains = records.map((r) => r.domain);
  assert.ok(domains.includes("tw.ashersanc.online"));
});

test("parseModa165027Json: carries 一頁式數位經濟詐騙網站 through as fraudDescription, never as siteNature", () => {
  const records = parseModa165027Json(fixtureRows);
  const record = records.find((r) => r.domain === "tobuyersepc24.com");
  assert.equal(record.fraudDescription, "連至PChome 24H購物網站首頁");
  assert.equal(record.siteNature, null);
});

test("parseModa165027Json: 停止解析日期 is carried through as-is (8-digit YYYYMMDD)", () => {
  const records = parseModa165027Json(fixtureRows);
  const record = records.find((r) => r.domain === "newebpay55.democrat");
  assert.equal(record.reportedYearMonth, "20261008");
});

test("parseModa165027Json: a row with a blank 網域名稱 is dropped rather than failing the whole import", () => {
  const rows = [
    { 編號: "1", 一頁式數位經濟詐騙網站: "測試", 偽冒網址: "", 網域名稱: "", 詐騙網站創建日期: "", 接獲通報日期: "20261001", 停止解析日期: "20261001" },
    { 編號: "2", 一頁式數位經濟詐騙網站: "測試", 偽冒網址: "", 網域名稱: "real-scam.example", 詐騙網站創建日期: "", 接獲通報日期: "20261001", 停止解析日期: "20261001" },
  ];
  const records = parseModa165027Json(rows);
  assert.equal(records.length, 1);
  assert.equal(records[0].domain, "real-scam.example");
});

test("parseModa165027Json: throws when the upstream response isn't an array", () => {
  assert.throws(() => parseModa165027Json({ not: "an array" }), /expected a JSON array/);
});

test("moda165027RawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("數產署 165027 詐騙網域停止解析清單", moda165027RawSchema, [
      {
        編號: "1",
        一頁式數位經濟詐騙網站: "連至PChome 24H購物網站首頁",
        偽冒網址: "https://tobuyersepc24.com/57vgaqk#/login",
        網域名稱: "tobuyersepc24.com",
        詐騙網站創建日期: "2023-06-28T11:07:03",
        接獲通報日期: "20230629",
        停止解析日期: "20230629",
      },
    ]),
  );
});

test("moda165027RawSchema: throws loudly if upstream renames/drops 網域名稱", () => {
  assert.throws(
    () =>
      validateImportRows("數產署 165027 詐騙網域停止解析清單", moda165027RawSchema, [
        { 編號: "1", 域名: "tobuyersepc24.com" },
      ]),
    /field "網域名稱"/,
  );
});
