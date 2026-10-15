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

const { kcgChildcareRowSchema, buildKaohsiungChildcareRecords } = await import("./kaohsiungChildcare.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real-shaped sample rows, confirmed live 2026-10-14 (128099 私立 and 128100
// 公設民營, via openapi.kcg.gov.tw — both already ship lat/lng directly).
const REAL_ROW_PRIVATE = {
  id: "130096",
  lat: "22.6345135",
  lng: "120.3459969",
  informaddress: "高雄市鳳山區文教路156號",
  hlink: "",
  informtel: "07-7670639",
  servItem: "嬰幼兒生活照顧、發展學習、衛生保健、親職教育",
  servTime: "星期一至星期五    07:30-18:00",
  dataOrg: "社會局 兒少科",
  doOrg: "",
  text: "高雄市私立愛貝兒托嬰中心",
};

const REAL_ROW_PUBLIC_PRIVATE = {
  id: "89282",
  lat: "22.56832",
  lng: "120.355825",
  informaddress: "高雄市小港區康莊路80號2樓",
  hlink: "",
  informtel: "07-8055828",
  servItem: "嬰幼兒生活照顧、發展學習、衛生保健、親職教育",
  servTime: "星期一至星期五07:30-18:00",
  dataOrg: "社會局兒少科",
  doOrg: "天主聖功醫療財團法人聖功醫院",
  text: "高雄市政府社會局委託天主聖功醫療財團法人聖功醫院辦理高雄市小港公共托嬰中心",
};

test("kcgChildcareRowSchema (128099/128100): accepts a real-shaped row", () => {
  assert.doesNotThrow(() => validateImportRows("高雄市私立托嬰中心 (128099)", kcgChildcareRowSchema, [REAL_ROW_PRIVATE]));
});

test("kcgChildcareRowSchema: throws if text (the institution name field) is renamed", () => {
  const { text, ...rest } = REAL_ROW_PRIVATE;
  assert.throws(
    () => validateImportRows("高雄市私立托嬰中心 (128099)", kcgChildcareRowSchema, [{ ...rest, name: text }]),
    /field "text"/,
  );
});

test("buildKaohsiungChildcareRecords: uses the API's own lat/lng directly (no geocoding needed) and tags every row with the sparse-data note", () => {
  const records = buildKaohsiungChildcareRecords([REAL_ROW_PRIVATE], "kcg_childcare_128099", "私立", "2026-10-14");
  assert.equal(records.length, 1);
  const [record] = records;
  assert.equal(record.name, "高雄市私立愛貝兒托嬰中心");
  assert.equal(record.address, "高雄市鳳山區文教路156號");
  assert.equal(record.lat, 22.6345135);
  assert.equal(record.lng, 120.3459969);
  assert.equal(record.serviceItem, "私立");
  assert.equal(record.extra.category, "私立");
  assert.ok(record.extra.dataNote && record.extra.dataNote.includes("2025"), "expected the sparse/dated-data note to be set");
  assert.equal(record.sourceKey, "kcg_childcare_128099");
});

test("buildKaohsiungChildcareRecords: 公設民營 source maps to the shared 公辦民營 category bucket", () => {
  const records = buildKaohsiungChildcareRecords(
    [REAL_ROW_PUBLIC_PRIVATE],
    "kcg_childcare_128100",
    "公辦民營",
    "2026-10-14",
  );
  assert.equal(records[0].serviceItem, "公辦民營");
  assert.equal(records[0].extra.category, "公辦民營");
  assert.equal(records[0].sourceKey, "kcg_childcare_128100");
});

test("buildKaohsiungChildcareRecords: rows missing text or informaddress are skipped", () => {
  const records = buildKaohsiungChildcareRecords([{ ...REAL_ROW_PRIVATE, text: "" }], "kcg_childcare_128099", "私立", "2026-10-14");
  assert.equal(records.length, 0);
});
