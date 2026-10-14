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

const { ntpcPrivateRawSchema, ntpcPublicRawSchema, ntpcHomeCenterRawSchema } = await import("./ntpcChildcare.ts");
const { validateImportRows } = await import("../../validation/importSchema.ts");

test("ntpcPrivateRawSchema (125380): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("新北市私立托嬰中心 (125380)", ntpcPrivateRawSchema, [
      {
        no: "1",
        title: "茵幼爾股份有限公司附設新北市私立寶貝媽咪托嬰中心",
        county: "新北市",
        countycode: "65000",
        area: "新北市板橋區",
        areacode: "65000010",
        address: "莊敬路46號2樓",
        localcallservice: "(02)82529955",
        person: "90",
      },
    ]),
  );
});

test("ntpcPrivateRawSchema (125380): throws if title is renamed", () => {
  assert.throws(
    () =>
      validateImportRows("新北市私立托嬰中心 (125380)", ntpcPrivateRawSchema, [
        { no: "1", name: "茵幼爾股份有限公司附設新北市私立寶貝媽咪托嬰中心", area: "新北市板橋區", address: "莊敬路46號2樓", localcallservice: "", person: "90" },
      ]),
    /field "title"/,
  );
});

test("ntpcPublicRawSchema (126222): accepts a real-shaped row (no capacity column in this dataset)", () => {
  assert.doesNotThrow(() =>
    validateImportRows("新北市公共托育中心 (126222)", ntpcPublicRawSchema, [
      {
        no: "1",
        name: "汐止忠厚公共托育中心",
        unit: "社團法人新北市兒童教保協會",
        county: "新北市",
        countycode: "65000",
        town: "汐止區",
        areacode: "65000110",
        address: "樟樹一路137巷26號2樓",
        localcallservice: "(02)26413300",
      },
    ]),
  );
});

test("ntpcPublicRawSchema (126222): throws if town is renamed (needed to build the full address)", () => {
  assert.throws(
    () =>
      validateImportRows("新北市公共托育中心 (126222)", ntpcPublicRawSchema, [
        { no: "1", name: "汐止忠厚公共托育中心", unit: "社團法人新北市兒童教保協會", county: "新北市", district: "汐止區", address: "樟樹一路137巷26號2樓", localcallservice: "" },
      ]),
    /field "town"/,
  );
});

test("ntpcHomeCenterRawSchema (125505): accepts a real-shaped row", () => {
  assert.doesNotThrow(() =>
    validateImportRows("新北市居家托育服務中心 (125505)", ntpcHomeCenterRawSchema, [
      {
        seqno: "2",
        title: "新北市七星區居家托育服務中心",
        entrust_unit: "德育學校財團法人德育護理健康學院",
        servicearea: "汐止、瑞芳、平溪、雙溪、貢寮",
        localcallservice: "(02)26427082",
        county: "新北市",
        countycode: "65000",
        area: "新北市汐止區",
        areacode: "65000110",
        address: "樟樹一路131號2樓",
      },
    ]),
  );
});

test("ntpcHomeCenterRawSchema (125505): throws if servicearea is renamed (the field this facility type surfaces as extra_json.serviceDistrict)", () => {
  assert.throws(
    () =>
      validateImportRows("新北市居家托育服務中心 (125505)", ntpcHomeCenterRawSchema, [
        { seqno: "2", title: "新北市七星區居家托育服務中心", entrust_unit: "德育學校財團法人德育護理健康學院", area: "新北市汐止區", address: "樟樹一路131號2樓", localcallservice: "" },
      ]),
    /field "servicearea"/,
  );
});
