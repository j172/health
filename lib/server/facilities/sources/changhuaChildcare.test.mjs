import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
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

const { changhuaChildcareRawSchema, buildChanghuaChildcareRecords } = await import("./changhuaChildcare.ts");
const { decodeBig5 } = await import("../csv.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real-shaped sample rows, confirmed live 2026-10-14 against data.gov.tw
// dataset 95198 (email.chcg.gov.tw).

test("changhuaChildcareRawSchema (95198): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("彰化縣公私協力及私立托嬰中心 (95198)", changhuaChildcareRawSchema, [
      {
        項目: "公私協力及私立托嬰中心",
        名稱: "彰化基督教醫院職工福利委員會附設托嬰中心",
        電話: "04-7114013",
        地址縣市: "10007",
        地址鄉鎮市區: "10007010",
        地址: "彰化縣彰化市大埔路485巷106-1號",
        年度: "115",
      },
    ]),
  );
});

test("changhuaChildcareRawSchema (95198): throws if 地址 is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("彰化縣公私協力及私立托嬰中心 (95198)", changhuaChildcareRawSchema, [
        { 項目: "公私協力及私立托嬰中心", 名稱: "捷樂蒂托嬰中心", 電話: "04-7381071", 地址縣市: "10007", 地址鄉鎮市區: "10007010" },
      ]),
    /field "地址"/,
  );
});

test("decodeBig5: a real cp950-labelled byte sample from this dataset decodes to correct Chinese text", () => {
  // Byte sequence for a real institution name in the live 95198 CSV
  // ("彰化基督教醫院職工福利委員會附設托嬰中心") as it actually appears
  // cp950/Big5-encoded on the wire (confirmed live 2026-10-14; issue #607's
  // AC explicitly calls for a cp950 decode test case).
  const text = "彰化基督教醫院職工福利委員會附設托嬰中心";
  const big5Bytes = Buffer.from([
    0xb9, 0xfc, 0xa4, 0xc6, 0xb0, 0xf2, 0xb7, 0xfe, 0xb1, 0xd0, 0xc2, 0xe5, 0xb0, 0x7c, 0xc2, 0xbe, 0xa4, 0x75,
    0xba, 0xd6, 0xa7, 0x51, 0xa9, 0x65, 0xad, 0xfb, 0xb7, 0x7c, 0xaa, 0xfe, 0xb3, 0x5d, 0xa6, 0xab, 0xc0, 0xa6,
    0xa4, 0xa4, 0xa4, 0xdf,
  ]);
  const decoded = decodeBig5(big5Bytes);
  assert.equal(decoded, text);
  assert.ok(!decoded.includes("�"), "must not contain the U+FFFD replacement character");
});

test("buildChanghuaChildcareRecords: leaves category/serviceItem null — every live row shares one constant 項目 label", () => {
  const rows = [
    { 項目: "公私協力及私立托嬰中心", 名稱: "喬依思托嬰中心", 電話: "04-7235658", 地址縣市: "10007", 地址鄉鎮市區: "10007010", 地址: "彰化縣彰化市三民路237巷41號", 年度: "115" },
  ];
  const records = buildChanghuaChildcareRecords(rows, "2026-10-14");
  assert.equal(records.length, 1);
  assert.equal(records[0].serviceItem, null);
  assert.equal(records[0].extra.category, undefined);
  assert.equal(records[0].address, "彰化縣彰化市三民路237巷41號");
  assert.equal(records[0].sourceKey, "changhua_childcare_95198");
});

test("buildChanghuaChildcareRecords: skips a row missing 名稱 or 地址", () => {
  const rows = [
    { 項目: "公私協力及私立托嬰中心", 名稱: "", 地址: "彰化縣彰化市某路1號", 電話: "" },
    { 項目: "公私協力及私立托嬰中心", 名稱: "某托嬰中心", 地址: "", 電話: "" },
  ];
  const records = buildChanghuaChildcareRecords(rows, "2026-10-14");
  assert.equal(records.length, 0);
});
