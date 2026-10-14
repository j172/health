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
  buildChildcareSourceId,
  buildChildcareDedupeKey,
  normalizeInstitutionName,
  stripFloorForDedupe,
  CHILDCARE_COUNTY_CODE,
} = await import("./childcareCenterShared.ts");

test("buildChildcareSourceId: county code + normalized name + address, truncated to 100 chars", () => {
  const sourceId = buildChildcareSourceId("63000", "臺北市私立怡寶優質托嬰中心", "臺北市士林區文林路740巷9弄24號1樓");
  assert.equal(sourceId, "63000|臺北市私立怡寶優質托嬰中心|臺北市士林區文林路740巷9弄24號1樓");
  assert.ok(sourceId.length <= 100);
});

test("buildChildcareSourceId: never bakes in a dataset ID or year — only county code + name + address", () => {
  const a = buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taipei, "某托嬰中心", "臺北市中正區某路1號");
  const b = buildChildcareSourceId(CHILDCARE_COUNTY_CODE.taipei, "某托嬰中心", "臺北市中正區某路1號");
  assert.equal(a, b, "same county+name+address must always produce the same sourceId, regardless of which year's dataset it came from");
});

test("normalizeInstitutionName: strips bracketed annotations and whitespace", () => {
  assert.equal(
    normalizeInstitutionName("立法院附設臺北市私立員工子女托嬰中心(委託社團法人新北市嬰幼兒托育協會經營管理)"),
    "立法院附設臺北市私立員工子女托嬰中心",
  );
  assert.equal(normalizeInstitutionName("  臺北市私立怡寶托嬰中心  "), "臺北市私立怡寶托嬰中心");
});

test("stripFloorForDedupe: strips a trailing single-floor marker", () => {
  assert.equal(stripFloorForDedupe("臺北市中正區晉江街115號1樓"), "臺北市中正區晉江街115號");
});

test("stripFloorForDedupe: strips a trailing multi-floor marker joined by 、", () => {
  assert.equal(stripFloorForDedupe("臺北市士林區天母西路48號1、2樓"), "臺北市士林區天母西路48號");
});

test("stripFloorForDedupe: leaves an address with no trailing floor marker untouched", () => {
  assert.equal(stripFloorForDedupe("臺北市北投區中央北路2段227號"), "臺北市北投區中央北路2段227號");
});

test("stripFloorForDedupe: does not touch a house number that merely contains digits before 號", () => {
  // Must not eat the house number itself when there's no 樓 at all.
  assert.equal(stripFloorForDedupe("新北市板橋區莊敬路46號"), "新北市板橋區莊敬路46號");
});

test("buildChildcareDedupeKey: matches two rows for the same institution despite a floor-suffix difference", () => {
  const privateKey = buildChildcareDedupeKey("臺北市私立晴晴托嬰中心", "臺北市師大路176號1樓");
  const quasiKey = buildChildcareDedupeKey("臺北市私立晴晴托嬰中心", "臺北市師大路176號");
  assert.equal(privateKey, quasiKey);
});

test("buildChildcareDedupeKey: does not match two rows with genuinely different house numbers", () => {
  const privateKey = buildChildcareDedupeKey("臺北市私立某某托嬰中心", "臺北市北投區中央北路2段191號1樓");
  const quasiKey = buildChildcareDedupeKey("臺北市私立某某托嬰中心", "臺北市北投區中央北路2段227號1樓");
  assert.notEqual(privateKey, quasiKey);
});

test("buildChildcareDedupeKey: ignores a parenthetical annotation difference in the name", () => {
  const a = buildChildcareDedupeKey(
    "立法院附設臺北市私立員工子女托嬰中心(委託社團法人新北市嬰幼兒托育協會經營管理)",
    "臺北市中正區青島東路1-3號1樓",
  );
  const b = buildChildcareDedupeKey("立法院附設臺北市私立員工子女托嬰中心", "臺北市中正區青島東路1-3號1樓");
  assert.equal(a, b);
});
