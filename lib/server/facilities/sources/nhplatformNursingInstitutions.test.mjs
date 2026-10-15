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

const {
  nhplatformNursingRawSchema,
  parseRocDateToIso,
  buildNhplatformSourceId,
  mapRowToFacilityRecord,
  POSTPARTUM_CARE_CATEGORY,
  LONG_TERM_CARE_MERGED_CATEGORIES,
} = await import("./nhplatformNursingInstitutions.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

// Real-shaped rows from a live fetch of data.gov.tw 115950 on 2026-10-14
// (https://nhplatform.mohw.gov.tw/dl-3820-74883655f255416abc752bef29cbd7aa.html,
// HTTP 200, 1,494 rows: 501 一般護理之家 + 751 居家護理所 + 241 產後護理之家).
const REAL_POSTPARTUM_ROW = {
  序號: "13",
  機構代碼: "7411041101",
  縣市別: "基隆市",
  機構名稱: "美好玥灣產後護理之家",
  "一般護理之家-開放床數": "0",
  "產後護理床-開放床數": "18",
  "護理類-嬰兒床-開放床數": "19",
  機構電話: "24280000",
  機構類別: "產後護理之家",
  地址: "基隆市仁愛區劉銘傳路1之8號9、10樓",
  評鑑結果: "合格",
  合格效期: "117年12月31日",
  定位地址: "基隆市仁愛區水錦里16鄰劉銘傳路1之8號",
  WGS84經度: "121.751037",
  WGS84緯度: "25.127872",
};

const REAL_GENERAL_NURSING_ROW = {
  序號: "1",
  機構代碼: "7111070517",
  縣市別: "基隆市",
  機構名稱: "衛生福利部基隆醫院附設護理之家",
  "一般護理之家-開放床數": "21",
  "產後護理床-開放床數": "0",
  "護理類-嬰兒床-開放床數": "0",
  機構電話: "24292525",
  機構類別: "一般護理之家",
  地址: "基隆市信義區信二路二六八號",
  評鑑結果: "合格",
  合格效期: "118年12月31日",
  定位地址: "基隆市信義區仁壽里18鄰信二路268號",
  WGS84經度: "121.748322",
  WGS84緯度: "25.130455",
};

const REAL_HOME_NURSING_ROW = {
  序號: "2",
  機構代碼: "7311030517",
  縣市別: "基隆市",
  機構名稱: "醫療財團法人臺灣區煤礦業基金會附設八堵居家護理",
  "一般護理之家-開放床數": "0",
  "產後護理床-開放床數": "0",
  "護理類-嬰兒床-開放床數": "0",
  機構電話: "02-24579101",
  機構類別: "居家護理所",
  地址: "基隆市暖暖區源遠路29號",
  評鑑結果: "合格",
  合格效期: "117年12月31日",
  定位地址: "基隆市暖暖區八堵里2鄰源遠路29之2號",
  WGS84經度: "121.733656",
  WGS84緯度: "25.107398",
};

// Confirmed live: 158/1494 rows (機構 that are "尚未評鑑" or "不合格") leave
// 合格效期 blank.
const REAL_NOT_YET_EVALUATED_ROW = {
  序號: "9",
  機構代碼: "7411020611",
  縣市別: "基隆市",
  機構名稱: "安和居家護理所",
  "一般護理之家-開放床數": "0",
  "產後護理床-開放床數": "0",
  "護理類-嬰兒床-開放床數": "0",
  機構電話: "02-24555278",
  機構類別: "居家護理所",
  地址: "基隆市七堵區南興路12號3樓",
  評鑑結果: "尚未評鑑",
  合格效期: "",
  定位地址: "基隆市七堵區南興路12號",
  WGS84經度: "121.714831",
  WGS84緯度: "25.097526",
};

test("nhplatformNursingRawSchema: accepts a real-shaped 產後護理之家 row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("Nursing institutions nationwide list (115950)", nhplatformNursingRawSchema, [
      REAL_POSTPARTUM_ROW,
    ]),
  );
});

test("nhplatformNursingRawSchema: accepts real-shaped 一般護理之家 and 居家護理所 rows", () => {
  assert.doesNotThrow(() =>
    validateImportRows("Nursing institutions nationwide list (115950)", nhplatformNursingRawSchema, [
      REAL_GENERAL_NURSING_ROW,
      REAL_HOME_NURSING_ROW,
    ]),
  );
});

test("nhplatformNursingRawSchema: tolerates a row with a blank 合格效期 (尚未評鑑/不合格 institutions)", () => {
  assert.doesNotThrow(() =>
    validateImportRows("Nursing institutions nationwide list (115950)", nhplatformNursingRawSchema, [
      REAL_NOT_YET_EVALUATED_ROW,
    ]),
  );
});

test("nhplatformNursingRawSchema: throws if the export renames 機構類別 (the field that routes postpartum_care vs long_term_care)", () => {
  const { 機構類別, ...rest } = REAL_POSTPARTUM_ROW;
  assert.throws(
    () =>
      validateImportRows("Nursing institutions nationwide list (115950)", nhplatformNursingRawSchema, [
        { ...rest, 類別: 機構類別 },
      ]),
    /field "機構類別"/,
  );
});

test("nhplatformNursingRawSchema: throws if the export renames WGS84經度 (the field this source depends on to skip geocoding)", () => {
  const { WGS84經度, ...rest } = REAL_POSTPARTUM_ROW;
  assert.throws(
    () =>
      validateImportRows("Nursing institutions nationwide list (115950)", nhplatformNursingRawSchema, [
        { ...rest, 經度: WGS84經度 },
      ]),
    /field "WGS84經度"/,
  );
});

test("parseRocDateToIso: converts a real 合格效期 value to ISO", () => {
  assert.equal(parseRocDateToIso("117年12月31日"), "2028-12-31");
  assert.equal(parseRocDateToIso("118年12月31日"), "2029-12-31");
});

test("parseRocDateToIso: pads single-digit month/day", () => {
  assert.equal(parseRocDateToIso("115年1月5日"), "2026-01-05");
});

test("parseRocDateToIso: returns null for a blank or unparseable value", () => {
  assert.equal(parseRocDateToIso(""), null);
  assert.equal(parseRocDateToIso(null), null);
  assert.equal(parseRocDateToIso(undefined), null);
  assert.equal(parseRocDateToIso("not a date"), null);
});

test("buildNhplatformSourceId: combines institution code, name, and address (not the dataset's row-sequence 序號)", () => {
  const id = buildNhplatformSourceId("7411041101", "美好玥灣產後護理之家", "基隆市仁愛區劉銘傳路1之8號9、10樓");
  assert.equal(id, "7411041101|美好玥灣產後護理之家|基隆市仁愛區劉銘傳路1之8號9、10樓");
  assert.ok(id.length <= 100);
});

test("buildNhplatformSourceId: truncates to 100 chars for an unusually long name+address combination", () => {
  const id = buildNhplatformSourceId("1234567890", "極長機構名稱".repeat(20), "極長地址".repeat(20));
  assert.ok(id.length <= 100);
});

test("category constants: 產後護理之家 and the two merged long-term-care categories are distinct", () => {
  assert.equal(POSTPARTUM_CARE_CATEGORY, "產後護理之家");
  assert.deepEqual(LONG_TERM_CARE_MERGED_CATEGORIES, ["一般護理之家", "居家護理所"]);
  assert.ok(!LONG_TERM_CARE_MERGED_CATEGORIES.includes(POSTPARTUM_CARE_CATEGORY));
});

test("mapRowToFacilityRecord: routes 產後護理之家 to facilityType postpartum_care with no service_item/category, carrying beds + evaluation + self-contained coordinates", () => {
  const record = mapRowToFacilityRecord(REAL_POSTPARTUM_ROW);
  assert.equal(record.facilityType, "postpartum_care");
  assert.equal(record.sourceKey, "nhplatform_115950_postpartum");
  assert.equal(record.serviceItem, null);
  assert.equal(record.lat, 25.127872);
  assert.equal(record.lng, 121.751037);
  assert.equal(record.extra.category, undefined);
  assert.equal(record.extra.postpartumBeds, 18);
  assert.equal(record.extra.infantBeds, 19);
  assert.equal(record.extra.generalNursingBeds, 0);
  assert.deepEqual(record.extra.evaluations, [{ year: "", result: "合格", validUntil: "2028-12-31" }]);
});

test("mapRowToFacilityRecord: routes 一般護理之家 to facilityType long_term_care with service_item + extra.category set to the Chinese category string", () => {
  const record = mapRowToFacilityRecord(REAL_GENERAL_NURSING_ROW);
  assert.equal(record.facilityType, "long_term_care");
  assert.equal(record.sourceKey, "nhplatform_115950_ltc");
  assert.equal(record.serviceItem, "一般護理之家");
  assert.equal(record.extra.category, "一般護理之家");
  assert.equal(record.extra.generalNursingBeds, 21);
});

test("mapRowToFacilityRecord: routes 居家護理所 to facilityType long_term_care with service_item + extra.category set accordingly", () => {
  const record = mapRowToFacilityRecord(REAL_HOME_NURSING_ROW);
  assert.equal(record.facilityType, "long_term_care");
  assert.equal(record.sourceKey, "nhplatform_115950_ltc");
  assert.equal(record.serviceItem, "居家護理所");
  assert.equal(record.extra.category, "居家護理所");
});

test("mapRowToFacilityRecord: the two long_term_care-destined sourceKeys never collide with the postpartum_care sourceKey, even for the same institution code", () => {
  const postpartum = mapRowToFacilityRecord(REAL_POSTPARTUM_ROW);
  const ltc = mapRowToFacilityRecord(REAL_GENERAL_NURSING_ROW);
  assert.notEqual(postpartum.sourceKey, ltc.sourceKey);
});

test("mapRowToFacilityRecord: a 尚未評鑑 row (blank 合格效期) still gets an evaluations entry with an empty validUntil, not a crash", () => {
  const record = mapRowToFacilityRecord(REAL_NOT_YET_EVALUATED_ROW);
  assert.deepEqual(record.extra.evaluations, [{ year: "", result: "尚未評鑑", validUntil: "" }]);
});

test("mapRowToFacilityRecord: returns null for a row with an unrecognized 機構類別 instead of throwing", () => {
  const record = mapRowToFacilityRecord({ ...REAL_POSTPARTUM_ROW, 機構類別: "精神護理之家" });
  assert.equal(record, null);
});

test("mapRowToFacilityRecord: returns null for a row missing an identity-bearing field", () => {
  assert.equal(mapRowToFacilityRecord({ ...REAL_POSTPARTUM_ROW, 機構代碼: "" }), null);
  assert.equal(mapRowToFacilityRecord({ ...REAL_POSTPARTUM_ROW, 機構名稱: "" }), null);
  assert.equal(mapRowToFacilityRecord({ ...REAL_POSTPARTUM_ROW, 地址: "" }), null);
});
