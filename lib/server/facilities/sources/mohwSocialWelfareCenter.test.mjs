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
  mohwSocialWelfareCenterRawSchema,
  buildSocialWelfareCenterAddress,
  buildSocialWelfareCenterSourceId,
  cleanSocialWelfareCenterPhone,
} = await import("./mohwSocialWelfareCenter.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseCsv, decodeBig5 } = await import("../csv.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/mohw-social-welfare-center-160903-sample.csv",
);

function loadFixtureRows() {
  const buffer = fs.readFileSync(FIXTURE_PATH);
  return parseCsv(decodeBig5(buffer));
}

test("real fixture (160903 sample): parses the real Big5 CSV header/field mapping", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 7);
  assert.deepEqual(Object.keys(rows[0]), ["縣市別", "機關單位名稱", "服務轄區", "地址", "電話"]);
  assert.equal(rows[0]["機關單位名稱"], "士林社會福利服務中心");
  assert.equal(rows[0]["地址"], "臺北市士林區基河路140號1樓");
});

test("real fixture: passes validateImportRows (no column renamed/removed)", () => {
  const rows = loadFixtureRows();
  assert.doesNotThrow(() =>
    validateImportRows("MOHW social welfare centers (160903)", mohwSocialWelfareCenterRawSchema, rows),
  );
});

test("real fixture: the blank-機關單位名稱 satellite sub-entry row is excluded by the identity-field filter used in fetchMohwSocialWelfareCenters", () => {
  const rows = loadFixtureRows();
  const named = rows.filter((r) => r["機關單位名稱"] && r["地址"] && r["縣市別"]);
  assert.equal(named.length, 6, "the 1 blank-name 澎湖縣 satellite row in the fixture should be dropped");
});

test("buildSocialWelfareCenterAddress: strips the stray trailing '?' artifact (confirmed live on 8/158 Taipei rows)", () => {
  assert.equal(
    buildSocialWelfareCenterAddress("臺北市", "臺北市大同區昌吉街57號6樓?"),
    "臺北市大同區昌吉街57號6樓",
  );
});

test("buildSocialWelfareCenterAddress: strips a '暫時辦公處：' annotation and keeps the county-prefixed address after it", () => {
  assert.equal(
    buildSocialWelfareCenterAddress("新北市", "暫時辦公處：\n新北市板橋區漢生東路258號3樓"),
    "新北市板橋區漢生東路258號3樓",
  );
});

test("buildSocialWelfareCenterAddress: normalizes the '巿' (U+5DFF) homoglyph instead of double-prefixing the county", () => {
  assert.equal(
    buildSocialWelfareCenterAddress("桃園市", "桃園巿八德區興豐路287號4樓"),
    "桃園市八德區興豐路287號4樓",
  );
});

test("buildSocialWelfareCenterAddress: prepends the county when the address starts straight at the 鄉鎮市區 level", () => {
  assert.equal(
    buildSocialWelfareCenterAddress("宜蘭縣", "礁溪鄉礁溪路4段126號1樓"),
    "宜蘭縣礁溪鄉礁溪路4段126號1樓",
  );
});

test("buildSocialWelfareCenterAddress: leaves an already county-prefixed address untouched", () => {
  assert.equal(
    buildSocialWelfareCenterAddress("臺北市", "臺北市士林區基河路140號1樓"),
    "臺北市士林區基河路140號1樓",
  );
});

test("buildSocialWelfareCenterSourceId: produces a stable compound key {name}|{address}", () => {
  assert.equal(
    buildSocialWelfareCenterSourceId("士林社會福利服務中心", "臺北市士林區基河路140號1樓"),
    "士林社會福利服務中心|臺北市士林區基河路140號1樓",
  );
});

test("buildSocialWelfareCenterSourceId: trims whitespace and enforces the 100-character cap", () => {
  const longName = "A".repeat(80);
  const longAddress = "B".repeat(80);
  const sourceId = buildSocialWelfareCenterSourceId(`  ${longName}  `, `  ${longAddress}  `);
  assert.ok(sourceId.length <= 100);
  assert.equal(sourceId, `${longName}|${"B".repeat(19)}`);
});

test("cleanSocialWelfareCenterPhone: collapses an embedded newline between two numbers into a single line", () => {
  assert.equal(cleanSocialWelfareCenterPhone("03-8886-610\n03-8886-675"), "03-8886-610、03-8886-675");
});

test("cleanSocialWelfareCenterPhone: doesn't double the separator when the raw value already has one before the newline", () => {
  assert.equal(cleanSocialWelfareCenterPhone("06-2090860、\n06-2090861"), "06-2090860、06-2090861");
});

test("mohwSocialWelfareCenterRawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("MOHW social welfare centers (160903)", mohwSocialWelfareCenterRawSchema, [
      {
        縣市別: "臺北市",
        機關單位名稱: "士林社會福利服務中心",
        服務轄區: "士林區",
        地址: "臺北市士林區基河路140號1樓",
        電話: "02-2835-0247",
      },
    ]),
  );
});

test("mohwSocialWelfareCenterRawSchema: tolerates a legitimately blank 服務轄區/機關單位名稱 (a satellite sub-entry row)", () => {
  assert.doesNotThrow(() =>
    validateImportRows("MOHW social welfare centers (160903)", mohwSocialWelfareCenterRawSchema, [
      { 縣市別: "澎湖縣", 機關單位名稱: "", 服務轄區: "", 地址: "七美據點：\n澎湖縣七美鄉平和村頂茄埕9-1號", 電話: "06-9971-370" },
    ]),
  );
});

test("mohwSocialWelfareCenterRawSchema: throws if 機關單位名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("MOHW social welfare centers (160903)", mohwSocialWelfareCenterRawSchema, [
        { 縣市別: "臺北市", 單位名稱: "士林社會福利服務中心", 服務轄區: "士林區", 地址: "臺北市士林區基河路140號1樓", 電話: "02-2835-0247" },
      ]),
    /field "機關單位名稱"/,
  );
});

test("mohwSocialWelfareCenterRawSchema: throws if 地址 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("MOHW social welfare centers (160903)", mohwSocialWelfareCenterRawSchema, [
        { 縣市別: "臺北市", 機關單位名稱: "士林社會福利服務中心", 服務轄區: "士林區", 電話: "02-2835-0247" },
      ]),
    /field "地址"/,
  );
});
