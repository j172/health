import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

const REPO_ROOT = new URL("../../../", import.meta.url);

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
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
    }
    return nextResolve(target, context);
  },
});

const { parseGenerationUnits } = await import("./fetchGenerationUnits.ts");
const { parseGenerationMix } = await import("./fetchGenerationMix.ts");

test("parseGenerationUnits strips UTF-8 BOM and parses live payload", () => {
  // 帶有 \uFEFF 開頭的真實台電回傳結構模擬
  const rawWithBom = "\uFEFF" + JSON.stringify({
    DateTime: "2026-10-23T15:20:00",
    aaData: [
      {
        機組類型: "燃氣",
        機組名稱: "大潭CC#1",
        "裝置容量(MW)": "742.7",
        "淨發電量(MW)": "624.8",
        "淨發電量/裝置容量比(%)": "84.125%",
        備註: " ",
      },
      {
        機組類型: "燃氣",
        機組名稱: "大潭CC#3",
        "裝置容量(MW)": "724.7",
        "淨發電量(MW)": "0.0",
        "淨發電量/裝置容量比(%)": "0.000%",
        備註: "歲修",
      },
      {
        機組類型: "無效機組",
        機組名稱: "", // 缺名稱，應被 filter
        "裝置容量(MW)": "100",
        "淨發電量(MW)": "50",
      },
    ],
  });

  const records = parseGenerationUnits(rawWithBom);
  assert.equal(records.length, 2);

  assert.deepEqual(records[0], {
    unitName: "大潭CC#1",
    unitType: "燃氣",
    capacityMw: 742.7,
    netGenerationMw: 624.8,
    capacityRatioPct: 84.125,
    remark: null,
    sourceDatetime: "2026-10-23 15:20:00",
  });

  assert.deepEqual(records[1], {
    unitName: "大潭CC#3",
    unitType: "燃氣",
    capacityMw: 724.7,
    netGenerationMw: 0.0,
    capacityRatioPct: 0.0,
    remark: "歲修",
    sourceDatetime: "2026-10-23 15:20:00",
  });
});

test("parseGenerationMix parses latest MOEAEA CSV with '台灣地區電力系統' header", () => {
  const latestCsv =
    '台灣地區電力系統,總裝置容量(數值),配比(%),資料所屬機關,備註\n' +
    '台電,"31,669",65.00%,經濟部能源署,\n' +
    '民營電廠,"8,926",18.30%,經濟部能源署,\n' +
    '汽電共生,"8,109",16.60%,經濟部能源署,\n' +
    '合計,"48,703",100%,經濟部能源署,\n';

  const records = parseGenerationMix(latestCsv);
  assert.equal(records.length, 4);

  assert.equal(records[0].sourceCategory, "台電");
  assert.equal(records[0].capacityMw, 31669);
  assert.equal(records[0].capacityRatioPct, 65.0);
  assert.equal(records[0].dataOrg, "經濟部能源署");

  assert.equal(records[3].sourceCategory, "合計");
  assert.equal(records[3].capacityMw, 48703);
  assert.equal(records[3].capacityRatioPct, 100);
});

test("parseGenerationMix backward compatible with legacy '電力來源' header", () => {
  const legacyCsv =
    '電力來源,"總裝置容量(數值,MW)",配比(%),資料所屬機關\n' +
    '台電,31669,65.00%,經濟部能源署\n' +
    '合計,48703,100%,經濟部能源署\n';

  const records = parseGenerationMix(legacyCsv);
  assert.equal(records.length, 2);
  assert.equal(records[0].sourceCategory, "台電");
  assert.equal(records[0].capacityMw, 31669);
  assert.equal(records[1].sourceCategory, "合計");
});
