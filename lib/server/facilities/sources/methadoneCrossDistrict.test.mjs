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
  methadoneCrossDistrictRawSchema,
  buildMethadoneCrossDistrictSourceId,
  joinMultilineField,
} = await import("./methadoneCrossDistrict.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");
const { parseCsv } = await import("../csv.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/methadone-cross-district-133345-sample.csv",
);

function loadFixtureRows() {
  const text = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return parseCsv(text);
}

test("real fixture (133345 sample): parses the real CSV header/field mapping", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 5);
  assert.deepEqual(Object.keys(rows[0]), [
    "序號",
    "機構名稱",
    "機構地址",
    "聯絡電話",
    "分機",
    "平日給藥時間",
    "假日給藥時間",
    "其他給藥時間",
    "轉入掛號費",
    "跨區給藥服務費",
    "轉出掛號費",
    "跨區給藥評估費",
    "注意事項",
  ]);
  assert.equal(rows[0]["機構名稱"], "臺北市立聯合醫院林森中醫昆明院區");
  assert.equal(rows[0]["機構地址"], "臺北市萬華區昆明街100號4樓");
});

test("real fixture: embedded newline inside a quoted dosing-time field survives the whole-stream CSV parser intact", () => {
  const rows = loadFixtureRows();
  assert.equal(rows[0]["平日給藥時間"], "07:30-08:30\n12:30-20:00");
  assert.equal(rows[0]["假日給藥時間"], "07:30-08:30\n12:30-20:00");
});

test("real fixture: tolerates legitimately blank 分機/注意事項 (7/65 and 19/65 real rows respectively)", () => {
  const rows = loadFixtureRows();
  const row2 = rows.find((r) => r["序號"] === "2");
  assert.equal(row2["分機"], "");
  assert.equal(row2["注意事項"], "");
  assert.doesNotThrow(() =>
    validateImportRows("Methadone cross-district dosing facilities (133345)", methadoneCrossDistrictRawSchema, rows),
  );
});

test("joinMultilineField: collapses a real multi-line dosing-time field into one 、-joined line, trimming trailing spaces", () => {
  assert.equal(joinMultilineField("07:30-08:30 \n12:30-20:00"), "07:30-08:30、12:30-20:00");
  assert.equal(joinMultilineField("12:30-14:30\n16:30-19:30"), "12:30-14:30、16:30-19:30");
});

test("joinMultilineField: collapses a real 3-line 注意事項 note (row 3's 耕莘醫院 case)", () => {
  const raw =
    "1.若平日遇天災，新北市宣布停止上班則改為假日服藥時間。 \n2.院內節日(如聖誕節)亦為假日服藥時間。 \n3.本院遇國定連續假日時未採用彈性放假，請務必事先來電詢問服藥時間。";
  assert.equal(
    joinMultilineField(raw),
    "1.若平日遇天災，新北市宣布停止上班則改為假日服藥時間。、2.院內節日(如聖誕節)亦為假日服藥時間。、3.本院遇國定連續假日時未採用彈性放假，請務必事先來電詢問服藥時間。",
  );
});

test("joinMultilineField: a single-line value with no newline passes through trimmed", () => {
  assert.equal(joinMultilineField("12:00-19:30"), "12:00-19:30");
  assert.equal(joinMultilineField("  09:00-15:30  "), "09:00-15:30");
});

test("joinMultilineField: null/undefined/empty all return null", () => {
  assert.equal(joinMultilineField(null), null);
  assert.equal(joinMultilineField(undefined), null);
  assert.equal(joinMultilineField(""), null);
});

test("buildMethadoneCrossDistrictSourceId: produces a stable compound key {name}|{address}", () => {
  const sourceId = buildMethadoneCrossDistrictSourceId("臺北市立聯合醫院林森中醫昆明院區", "臺北市萬華區昆明街100號4樓");
  assert.equal(sourceId, "臺北市立聯合醫院林森中醫昆明院區|臺北市萬華區昆明街100號4樓");
});

test("buildMethadoneCrossDistrictSourceId: handles a null/empty address gracefully", () => {
  assert.equal(buildMethadoneCrossDistrictSourceId("某醫院", null), "某醫院|");
  assert.equal(buildMethadoneCrossDistrictSourceId("某醫院", undefined), "某醫院|");
});

test("methadoneCrossDistrictRawSchema: accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("Methadone cross-district dosing facilities (133345)", methadoneCrossDistrictRawSchema, [
      {
        機構名稱: "臺北市立聯合醫院林森中醫昆明院區",
        機構地址: "臺北市萬華區昆明街100號4樓",
        聯絡電話: "(02)23703739",
        平日給藥時間: "07:30-08:30\n12:30-20:00",
        假日給藥時間: "07:30-08:30\n12:30-20:00",
        其他給藥時間: "農曆年節期間及颱風08:00-17:00",
        轉入掛號費: "50元/次",
        跨區給藥服務費: "150元/日",
        轉出掛號費: "50元/次",
        跨區給藥評估費: "300元/次",
      },
    ]),
  );
});

test("methadoneCrossDistrictRawSchema: throws if 機構名稱 is renamed/removed upstream", () => {
  assert.throws(
    () =>
      validateImportRows("Methadone cross-district dosing facilities (133345)", methadoneCrossDistrictRawSchema, [
        { 機構名稱2: "某院所", 機構地址: "某地址", 聯絡電話: "", 平日給藥時間: "", 假日給藥時間: "", 其他給藥時間: "", 轉入掛號費: "", 跨區給藥服務費: "", 轉出掛號費: "", 跨區給藥評估費: "" },
      ]),
    /field "機構名稱"/,
  );
});

test("methadoneCrossDistrictRawSchema: throws if 平日給藥時間 is renamed/removed upstream (the field this ticket exists to surface)", () => {
  assert.throws(
    () =>
      validateImportRows("Methadone cross-district dosing facilities (133345)", methadoneCrossDistrictRawSchema, [
        { 機構名稱: "某院所", 機構地址: "某地址", 聯絡電話: "", 假日給藥時間: "", 其他給藥時間: "", 轉入掛號費: "", 跨區給藥服務費: "", 轉出掛號費: "", 跨區給藥評估費: "" },
      ]),
    /field "平日給藥時間"/,
  );
});
