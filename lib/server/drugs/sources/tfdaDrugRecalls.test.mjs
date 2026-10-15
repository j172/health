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

const {
  DRUG_RECALL_SOURCE,
  RECALL_LEVELS,
  RECALL_LEVEL_UNSPECIFIED,
  normalizeRecallLevel,
  extractLicenseNumbers,
  parseDrugRecalls,
  tfdaDrugRecallRawSchema,
} = await import("./tfdaDrugRecalls.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real excerpt (26 rows) of https://data.fda.gov.tw/data/opendata/export/34/json
// (data.gov.tw 6947), picked to cover every dirty 回收分級 spelling and the
// odd 許可證字號 shapes seen in the full 1,713-row file on 2026-10-15.
const sample = JSON.parse(
  readFileSync(new URL("./__fixtures__/tfda-drug-recall-6947-sample.json", import.meta.url), "utf-8"),
);

const row = (overrides = {}) => ({
  回收分級: "第二級",
  文號: "115年1月1日FDA風字第1150000001號",
  日期: "2026/01/01",
  產品: "測試錠 TEST TABLETS",
  許可證字號: "衛署藥製字第000001號",
  批號: "A001、A002",
  許可證持有者: "測試製藥股份有限公司",
  原因: "溶離試驗不符規定。",
  ...overrides,
});

test("source: 6947 on the already-reachable data.fda.gov.tw, source key fits drug_recalls' VARCHAR(40)", () => {
  assert.equal(DRUG_RECALL_SOURCE.datasetId, "6947");
  assert.equal(DRUG_RECALL_SOURCE.url, "https://data.fda.gov.tw/data/opendata/export/34/json");
  assert.ok(DRUG_RECALL_SOURCE.sourceKey.length <= 40);
});

test("RECALL_LEVELS is exactly {1,2,3,未載明}", () => {
  assert.deepEqual([...RECALL_LEVELS], ["1", "2", "3", "未載明"]);
  assert.equal(RECALL_LEVEL_UNSPECIFIED, "未載明");
});

// --- normalizeRecallLevel ----------------------------------------------------

test("normalizeRecallLevel: every spelling seen live (with its live count) collapses to {1,2,3,未載明}", () => {
  const live = [
    // [upstream value, expected]
    ["第二級 ", "2"], // 201 rows (trailing space)
    ["2", "2"], // 687
    ["第二級", "2"], // 576
    [null, "未載明"], // 153
    ["第一級", "1"], // 3
    ["1", "1"], // 53
    ["3", "3"], // 9
    ["-", "未載明"], // 1
    ["第三級", "3"], // 2
    ["二", "2"], // 2
    ["疑似第一級", "1"], // 1
    ["第2級", "2"], // 2
    ["3 ", "3"], // 2
    ["2 ", "2"], // 21
  ];
  for (const [input, expected] of live) {
    assert.equal(normalizeRecallLevel(input), expected, `normalizeRecallLevel(${JSON.stringify(input)})`);
  }
});

test("normalizeRecallLevel: blank, undefined, junk and out-of-range levels are 未載明, never a guess and never a throw", () => {
  for (const input of [undefined, null, "", "   ", "　", "-", "－", "—", "無", "第四級", "4", "0", "第二級以上", "一二", "abc"]) {
    assert.equal(normalizeRecallLevel(input), "未載明", `normalizeRecallLevel(${JSON.stringify(input)})`);
  }
});

test("normalizeRecallLevel: full-width digits, stray inner spaces and Chinese numerals normalize too", () => {
  assert.equal(normalizeRecallLevel("２"), "2");
  assert.equal(normalizeRecallLevel("第２級"), "2");
  assert.equal(normalizeRecallLevel("第 二 級"), "2");
  assert.equal(normalizeRecallLevel("三"), "3");
  assert.equal(normalizeRecallLevel("第一級"), "1");
});

// --- extractLicenseNumbers ---------------------------------------------------

test("extractLicenseNumbers: a plain license, with surrounding or inner whitespace, comes back in canonical form", () => {
  assert.deepEqual(extractLicenseNumbers("衛署藥製字第040794號"), ["衛署藥製字第040794號"]);
  assert.deepEqual(extractLicenseNumbers("衛署藥製字第045307號 "), ["衛署藥製字第045307號"]);
  assert.deepEqual(extractLicenseNumbers("衛署藥製字第 044025 號"), ["衛署藥製字第044025號"]);
  assert.deepEqual(extractLicenseNumbers("衛部藥製字第058537 號"), ["衛部藥製字第058537號"]);
});

test("extractLicenseNumbers: several licenses in one field (、 ； or '1. … 2. …') are all found, once each, in order", () => {
  assert.deepEqual(extractLicenseNumbers("衛署藥製字第014141號、衛署藥製字第036461號"), ["衛署藥製字第014141號", "衛署藥製字第036461號"]);
  assert.deepEqual(extractLicenseNumbers("1.衛署藥輸字第000502號  2.衛署藥輸字第009313號"), ["衛署藥輸字第000502號", "衛署藥輸字第009313號"]);
  assert.deepEqual(extractLicenseNumbers("衛署藥製字第034828號；衛署藥製字第034804號、衛署藥製字第034828號"), [
    "衛署藥製字第034828號",
    "衛署藥製字第034804號",
  ]);
});

test("extractLicenseNumbers: other license families keep their own prefix", () => {
  assert.deepEqual(extractLicenseNumbers("內衛藥製字第013761號"), ["內衛藥製字第013761號"]);
  assert.deepEqual(extractLicenseNumbers("衛署成製字第007869號"), ["衛署成製字第007869號"]);
  assert.deepEqual(extractLicenseNumbers("衛署菌疫輸字第000581號"), ["衛署菌疫輸字第000581號"]);
});

test("extractLicenseNumbers: no license, project-import notes and letter numbers yield [] (they still list, they just cannot be joined)", () => {
  for (const input of [null, undefined, "", "   ", "無(專案輸入藥品)", "無（專案製造藥品）", "專案進口,無許可證字號", "專案進口核備函字號FDA藥字第1040028641號", "內外化學工業股份有限公司全廠所有產品"]) {
    assert.deepEqual(extractLicenseNumbers(input), [], `extractLicenseNumbers(${JSON.stringify(input)})`);
  }
});

// --- parseDrugRecalls --------------------------------------------------------

test("parseDrugRecalls: the 26-row real excerpt parses to 26 records, every level in {1,2,3,未載明}", () => {
  const records = parseDrugRecalls(sample, new Date("2026-10-16T00:00:00Z"));
  assert.equal(sample.length, 26);
  assert.equal(records.length, 26);
  for (const r of records) {
    assert.ok(RECALL_LEVELS.includes(r.recallLevel), `unexpected level ${r.recallLevel}`);
    assert.match(r.rowKey, /^[0-9a-f]{64}$/);
    assert.equal(r.sourceKey, DRUG_RECALL_SOURCE.sourceKey);
    assert.ok(r.productName.length > 0);
  }
  // Every dirty spelling in the excerpt is present, and the result has no other values.
  assert.deepEqual([...new Set(records.map((r) => r.recallLevel))].sort(), ["1", "2", "3", "未載明"]);
});

test("parseDrugRecalls: maps one real row field by field (date, license, holder, reason line breaks, level)", () => {
  const records = parseDrugRecalls(sample, new Date("2026-10-16T00:00:00Z"));
  const r = records.find((x) => x.licenseText === "衛署藥製字第048164號");
  assert.ok(r);
  assert.equal(r.recalledOn, "2016-04-14");
  assert.deepEqual(r.licenseNos, ["衛署藥製字第048164號"]);
  // Level was "第二級 " (trailing space): normalized to "2", raw text kept (trimmed).
  assert.equal(r.recallLevel, "2");
  assert.equal(r.recallLevelRaw, "第二級");
  assert.equal(r.batchNo, "CG01B");
  assert.ok(r.holderName && r.holderName.length > 0);
});

test("parseDrugRecalls: the two rows without a 許可證字號 are still kept, with no license numbers to join on", () => {
  const records = parseDrugRecalls(sample, new Date("2026-10-16T00:00:00Z"));
  const noLicense = records.filter((r) => r.licenseText === null);
  assert.equal(noLicense.length, 2);
  for (const r of noLicense) {
    assert.deepEqual(r.licenseNos, []);
    assert.ok(r.productName.length > 0);
  }
});

test("parseDrugRecalls: a multi-license row exposes every license number (so each drug gets the badge), a project-import note exposes none", () => {
  const records = parseDrugRecalls(sample, new Date("2026-10-16T00:00:00Z"));
  const multi = records.find((r) => r.licenseText === "衛署藥製字第014141號、衛署藥製字第036461號");
  assert.ok(multi);
  assert.deepEqual(multi.licenseNos, ["衛署藥製字第014141號", "衛署藥製字第036461號"]);

  const numbered = records.find((r) => r.licenseText?.startsWith("1.衛署藥輸字第000502號"));
  assert.ok(numbered);
  assert.deepEqual(numbered.licenseNos, ["衛署藥輸字第000502號", "衛署藥輸字第009313號"]);

  const project = records.find((r) => r.licenseText?.startsWith("無("));
  assert.ok(project);
  assert.deepEqual(project.licenseNos, []);
});

test("parseDrugRecalls: a license written with inner spaces matches the canonical form used by the drugs table", () => {
  const records = parseDrugRecalls(sample, new Date("2026-10-16T00:00:00Z"));
  const spaced = records.find((r) => r.licenseText === "衛署藥製字第 044025 號");
  assert.ok(spaced);
  assert.deepEqual(spaced.licenseNos, ["衛署藥製字第044025號"]);
});

test("parseDrugRecalls: dates become ISO; placeholder (1911) and far-future typos become null instead of throwing", () => {
  const now = new Date("2026-10-16T00:00:00Z");
  const [good, placeholder, typo, junk, empty] = parseDrugRecalls(
    [
      row({ 日期: "2026/08/26", 批號: "G" }),
      row({ 日期: "1911/01/01", 批號: "P" }),
      row({ 日期: "2819/11/18", 批號: "T" }),
      row({ 日期: "not a date", 批號: "J" }),
      row({ 日期: null, 批號: "E" }),
    ],
    now,
  );
  assert.equal(good.recalledOn, "2026-08-26");
  assert.equal(placeholder.recalledOn, null);
  assert.equal(typo.recalledOn, null);
  assert.equal(junk.recalledOn, null);
  assert.equal(empty.recalledOn, null);
});

test("parseDrugRecalls: whitespace-only and null optional fields become null; CRLF is normalized; the product name is required", () => {
  const [a] = parseDrugRecalls([row({ 文號: "  ", 批號: null, 原因: "第一行\r\n第二行 ", 許可證持有者: "" })]);
  assert.equal(a.docNo, null);
  assert.equal(a.batchNo, null);
  assert.equal(a.holderName, null);
  assert.equal(a.reason, "第一行\n第二行");

  // A row with no product name has nothing to show: skipped rather than stored blank.
  assert.deepEqual(parseDrugRecalls([row({ 產品: null }), row({ 產品: "  " })]), []);
});

test("parseDrugRecalls: row keys are stable across calls and independent of JSON field order", () => {
  const a = parseDrugRecalls([row()])[0];
  const b = parseDrugRecalls([row()])[0];
  assert.equal(a.rowKey, b.rowKey);

  const base = row();
  const shuffled = Object.fromEntries(Object.entries(base).reverse());
  assert.equal(parseDrugRecalls([shuffled])[0].rowKey, a.rowKey);
});

test("parseDrugRecalls: the key is (文號, 許可證字號, 批號) — a different batch is a different recall, but a re-worded reason or date edit is the same row", () => {
  const base = parseDrugRecalls([row()])[0];
  assert.notEqual(parseDrugRecalls([row({ 批號: "A999" })])[0].rowKey, base.rowKey);
  assert.notEqual(parseDrugRecalls([row({ 許可證字號: "衛署藥製字第000002號" })])[0].rowKey, base.rowKey);
  assert.notEqual(parseDrugRecalls([row({ 文號: "另一份公文" })])[0].rowKey, base.rowKey);

  assert.equal(parseDrugRecalls([row({ 原因: "改寫後的原因" })])[0].rowKey, base.rowKey);
  assert.equal(parseDrugRecalls([row({ 日期: "2026/02/02" })])[0].rowKey, base.rowKey);
  assert.equal(parseDrugRecalls([row({ 回收分級: "1" })])[0].rowKey, base.rowKey);
});

test("parseDrugRecalls: fully identical rows are all kept, each with its own key (occurrence counter), and the keys are order-stable", () => {
  const records = parseDrugRecalls([row(), row(), row()]);
  assert.equal(records.length, 3);
  assert.equal(new Set(records.map((r) => r.rowKey)).size, 3);
  assert.deepEqual(
    parseDrugRecalls([row(), row(), row()]).map((r) => r.rowKey),
    records.map((r) => r.rowKey),
  );
});

test("parseDrugRecalls: an empty array is fine (zero records), a non-array payload or a renamed critical column throws loudly", () => {
  assert.deepEqual(parseDrugRecalls([]), []);
  assert.throws(() => parseDrugRecalls({ error: "maintenance" }), /expected an array/);
  const noLevelColumn = row();
  delete noLevelColumn.回收分級;
  assert.throws(() => parseDrugRecalls([noLevelColumn]), /schema validation failed/);
  const renamed = row();
  delete renamed.產品;
  renamed.品名 = "X";
  assert.throws(() => parseDrugRecalls([renamed]), /schema validation failed/);
});

test("tfdaDrugRecallRawSchema: nulls pass (real rows have them), a missing key fails", () => {
  assert.doesNotThrow(() =>
    validateImportRows("t", tfdaDrugRecallRawSchema, [{ 回收分級: null, 文號: null, 日期: null, 產品: null, 許可證字號: null, 批號: null }]),
  );
  assert.throws(() => validateImportRows("t", tfdaDrugRecallRawSchema, [{ 日期: null }]), /schema validation failed/);
});
