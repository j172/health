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
  taipeiBabyFriendlyRawSchema,
  buildTaipeiBabyFriendlySourceId,
  withTaipeiPrefix,
  mapTaipeiBabyFriendlyRows,
} = await import("./babyFriendlyHospitalTaipei.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseCsv } = await import("../csv.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/baby-friendly-taipei-121200-sample.csv",
);

function loadFixtureRows() {
  const text = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return parseCsv(text);
}

test("real fixture (121200 sample): parses the real CSV header/field mapping", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 4);
  assert.deepEqual(Object.keys(rows[0]), ["項次", "行政區代碼", "院所名稱", "地址", "效期"]);
  assert.equal(rows[0]["院所名稱"], "臺北市立萬芳醫院－委託臺北醫學大學辦理");
  assert.equal(rows[0]["效期"], "20241231");
});

test("real fixture: schema validation passes on the real row shape", () => {
  const rows = loadFixtureRows();
  assert.doesNotThrow(() => validateImportRows("Taipei baby-friendly hospitals (121200)", taipeiBabyFriendlyRawSchema, rows));
});

test("taipeiBabyFriendlyRawSchema: throws if the export renames 院所名稱 (sourceId depends on it)", () => {
  assert.throws(
    () =>
      validateImportRows("Taipei baby-friendly hospitals (121200)", taipeiBabyFriendlyRawSchema, [
        { 名稱: "測試醫院", 地址: "台北市中正區測試路1號", 效期: "20271231" },
      ]),
    /field "院所名稱"/,
  );
});

test("withTaipeiPrefix: restores a dropped 臺/台 prefix (real row 15, 北市大同區鄭州路145號)", () => {
  assert.equal(withTaipeiPrefix("北市大同區鄭州路145號"), "臺北市大同區鄭州路145號");
});

test("withTaipeiPrefix: leaves an already-prefixed address untouched (either spelling)", () => {
  assert.equal(withTaipeiPrefix("台北市文山區興隆路三段111號"), "台北市文山區興隆路三段111號");
  assert.equal(withTaipeiPrefix("臺北市內湖區成功路二段325號"), "臺北市內湖區成功路二段325號");
});

test("buildTaipeiBabyFriendlySourceId: stable compound key name|address", () => {
  assert.equal(
    buildTaipeiBabyFriendlySourceId("臺北醫學大學附設醫院", "臺北市信義區吳興街252號"),
    "臺北醫學大學附設醫院|臺北市信義區吳興街252號",
  );
});

test("mapTaipeiBabyFriendlyRows: drops rows whose 效期 has already passed as of todayIso (real fixture, 2 expired / 2 still valid)", () => {
  const rows = loadFixtureRows();
  const records = mapTaipeiBabyFriendlyRows(rows, "2026-10-14");

  // Fixture has 效期 20241231 (expired), 20251231 (expired), and two 20271231 (valid as of 2026-10-14).
  assert.equal(records.length, 2);
  assert.ok(records.every((r) => r.extra.validUntil === "2027-12-31"));
  assert.ok(!records.some((r) => r.name.includes("萬芳醫院")));
  assert.ok(!records.some((r) => r.name.includes("仁愛院區")));
});

test("mapTaipeiBabyFriendlyRows: the row with the dropped 臺/台 prefix still gets a usable address and survives filtering", () => {
  const rows = loadFixtureRows();
  const records = mapTaipeiBabyFriendlyRows(rows, "2026-10-14");
  const zhongxing = records.find((r) => r.name.includes("中興院區"));
  assert.ok(zhongxing, "expected 中興院區 row to survive (its 效期 20271231 is not expired)");
  assert.equal(zhongxing.address, "臺北市大同區鄭州路145號");
});

test("mapTaipeiBabyFriendlyRows: at an earlier todayIso, no rows have expired yet", () => {
  const rows = loadFixtureRows();
  const records = mapTaipeiBabyFriendlyRows(rows, "2020-01-01");
  assert.equal(records.length, 4);
});

test("mapTaipeiBabyFriendlyRows: every surviving record carries the right sourceKey/facilityType/dataOrg", () => {
  const rows = loadFixtureRows();
  const records = mapTaipeiBabyFriendlyRows(rows, "2026-10-14");
  for (const r of records) {
    assert.equal(r.facilityType, "baby_friendly_hospital");
    assert.equal(r.sourceKey, "baby_friendly_hospital_taipei_121200");
    assert.equal(r.dataOrg, "臺北市政府衛生局");
  }
});
