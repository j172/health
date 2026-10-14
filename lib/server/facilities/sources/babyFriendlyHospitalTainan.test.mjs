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
  tainanBabyFriendlyRawSchema,
  buildTainanBabyFriendlySourceId,
  mapTainanBabyFriendlyRows,
} = await import("./babyFriendlyHospitalTainan.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

const FIXTURE_PATH = path.join(
  fileURLToPath(REPO_ROOT),
  "lib/server/facilities/__fixtures__/baby-friendly-tainan-150985-sample.json",
);

function loadFixtureRows() {
  const text = fs.readFileSync(FIXTURE_PATH, "utf-8");
  return JSON.parse(text).data;
}

test("real fixture (150985 sample): parses the real JSON response shape (wrapped in a `data` array, unlike every other county's CSV)", () => {
  const rows = loadFixtureRows();
  assert.equal(rows.length, 2);
  assert.equal(rows[0]["院所名稱"], "郭綜合醫院");
  assert.equal(rows[0]["緯度"], "22.9948175");
  assert.equal(rows[0]["經度"], "120.1987023");
});

test("real fixture: schema validation passes on the real row shape", () => {
  const rows = loadFixtureRows();
  assert.doesNotThrow(() => validateImportRows("Tainan baby-friendly hospitals (150985)", tainanBabyFriendlyRawSchema, rows));
});

test("tainanBabyFriendlyRawSchema: throws if the export renames 緯度 (this source's one real differentiator — native coordinates)", () => {
  assert.throws(
    () =>
      validateImportRows("Tainan baby-friendly hospitals (150985)", tainanBabyFriendlyRawSchema, [
        { 院所名稱: "測試醫院", "地址-街路門牌": "測試路1號", lat: "23.0", 經度: "120.2" },
      ]),
    /field "緯度"/,
  );
});

test("buildTainanBabyFriendlySourceId: stable compound key name|address", () => {
  assert.equal(
    buildTainanBabyFriendlySourceId("郭綜合醫院", "臺南市民生路二段18．20．22．23．24．25．27號"),
    "郭綜合醫院|臺南市民生路二段18．20．22．23．24．25．27號",
  );
});

test("mapTainanBabyFriendlyRows: builds an address from 村里+街路門牌 (handles an empty 村里) and keeps real native coordinates — no 效期 column to filter on", () => {
  const rows = loadFixtureRows();
  const records = mapTainanBabyFriendlyRows(rows);
  assert.equal(records.length, 2);

  const guo = records.find((r) => r.name === "郭綜合醫院");
  assert.equal(guo.address, "臺南市民生路二段18．20．22．23．24．25．27號");
  assert.equal(guo.lat, 22.9948175);
  assert.equal(guo.lng, 120.1987023);

  const jing = records.find((r) => r.name === "璟馨婦幼醫院");
  assert.equal(jing.address, "臺南市東橋里東橋七路198號");

  for (const r of records) {
    assert.equal(r.facilityType, "baby_friendly_hospital");
    assert.equal(r.sourceKey, "baby_friendly_hospital_tainan_150985");
    assert.equal(r.dataOrg, "臺南市政府衛生局");
  }
});

test("mapTainanBabyFriendlyRows: an unparseable coordinate becomes null, not NaN or 0", () => {
  const records = mapTainanBabyFriendlyRows([
    { 院所名稱: "測試醫院", "地址-村里": "", "地址-街路門牌": "測試路1號", 市話: "", 緯度: "", 經度: "" },
  ]);
  assert.equal(records.length, 1);
  assert.equal(records[0].lat, null);
  assert.equal(records[0].lng, null);
});
