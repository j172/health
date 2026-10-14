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
  changhuaBabyFriendlyRawSchema,
  buildChanghuaBabyFriendlySourceId,
  mapChanghuaBabyFriendlyRows,
} = await import("./babyFriendlyHospitalChanghua.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseCsv } = await import("../csv.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/baby-friendly-changhua-30882-sample.csv",
);

function loadFixtureRows() {
  const text = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return parseCsv(text);
}

test("real fixture (30882 sample): parses the real CSV header/field mapping — 效期 is free text, not YYYYMMDD", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 3);
  assert.deepEqual(Object.keys(rows[0]), ["序號", "醫事機構名稱", "郵遞區號", "地址", "市話", "效期"]);
  assert.equal(rows[0]["醫事機構名稱"], "彰化基督教醫療財團法人員林基督教醫院");
  assert.equal(rows[0]["效期"], "116年底");
});

test("real fixture: schema validation passes on the real row shape", () => {
  const rows = loadFixtureRows();
  assert.doesNotThrow(() => validateImportRows("Changhua baby-friendly hospitals (30882)", changhuaBabyFriendlyRawSchema, rows));
});

test("changhuaBabyFriendlyRawSchema: throws if the export renames 效期 (the field this ticket exists to filter on)", () => {
  assert.throws(
    () =>
      validateImportRows("Changhua baby-friendly hospitals (30882)", changhuaBabyFriendlyRawSchema, [
        { 醫事機構名稱: "測試醫院", 地址: "彰化縣彰化市測試路1號", 有效期限: "116年底" },
      ]),
    /field "效期"/,
  );
});

test("buildChanghuaBabyFriendlySourceId: stable compound key name|address", () => {
  assert.equal(
    buildChanghuaBabyFriendlySourceId("彰化基督教醫療財團法人彰化基督教醫院", "彰化市南校街135號"),
    "彰化基督教醫療財團法人彰化基督教醫院|彰化市南校街135號",
  );
});

test("mapChanghuaBabyFriendlyRows: '116年底' parses to 2027-12-31 and is NOT expired as of today (2026-10-14) — all 3 rows kept", () => {
  const rows = loadFixtureRows();
  const records = mapChanghuaBabyFriendlyRows(rows, "2026-10-14");
  assert.equal(records.length, 3);
  assert.ok(records.every((r) => r.extra.validUntil === "2027-12-31"));
});

test("mapChanghuaBabyFriendlyRows: drops every row once todayIso passes the ROC-year-end validity date (effity filtering actually works, not just parses)", () => {
  const rows = loadFixtureRows();
  const records = mapChanghuaBabyFriendlyRows(rows, "2028-01-01");
  assert.equal(records.length, 0);
});

test("mapChanghuaBabyFriendlyRows: a row whose 效期 is one day before todayIso is excluded, the exact boundary date is not", () => {
  const rows = loadFixtureRows();
  assert.equal(mapChanghuaBabyFriendlyRows(rows, "2027-12-31").length, 3, "still valid ON the last day");
  assert.equal(mapChanghuaBabyFriendlyRows(rows, "2028-01-01").length, 0, "expired the day after");
});

test("mapChanghuaBabyFriendlyRows: halfwidth-normalizes phone numbers", () => {
  const records = mapChanghuaBabyFriendlyRows(
    [{ 醫事機構名稱: "測試醫院", 地址: "彰化縣彰化市測試路1號", 市話: "(０４)１２３４５６７", 效期: "116年底" }],
    "2026-10-14",
  );
  assert.equal(records[0].phone, "(04)1234567");
});
