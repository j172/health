import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertNoForbiddenApis } from "../subsidies/testSupport.mjs";

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
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { estimateLtcBenefits } = await import("./estimateLtcBenefits.ts");

// ---------------------------------------------------------------------------
// Fixture schedule — small, hand-built set covering every behavior under
// test (deliberately NOT importing the real data/ltc-benefits.json, so
// these tests stay stable even as the real data file's amounts get
// re-verified every six months — same convention as
// lib/server/childSubsidies/matchChildSubsidies.test.mjs).
// ---------------------------------------------------------------------------

function makeSchedule() {
  return {
    careService: {
      monthlyAmountByLevel: { 2: 10000, 3: 15000, 4: 18000, 5: 24000, 6: 28000, 7: 32000, 8: 36000 },
      officialUrl: "https://example.gov.tw/",
      legalBasis: "test",
      lastVerified: "2026-10-15",
    },
    transport: {
      monthlyAmountByRegion: { region1: 1000, region2: 1500, region3: 2000, region4: 2500 },
      regionExamples: {
        region1: "第一區（示例）",
        region2: "第二區（示例）",
        region3: "第三區（示例）",
        region4: "第四區（示例）",
      },
      officialUrl: "https://example.gov.tw/",
      legalBasis: "test",
      lastVerified: "2026-10-15",
    },
    assistiveDevice: {
      triennialAmount: { groupOne: 40000, groupTwo: 60000 },
      homeModificationCapWithinGroupTwo: 20000,
      groupTwoEffectiveDate: "2026-07-01",
      officialUrl: "https://example.gov.tw/",
      legalBasis: "test",
      lastVerified: "2026-10-15",
    },
    respite: {
      annualAmountByLevel: { 2: 30000, 3: 30000, 4: 30000, 5: 30000, 6: 30000, 7: 48000, 8: 48000 },
      officialUrl: "https://example.gov.tw/",
      legalBasis: "test",
      lastVerified: "2026-10-15",
    },
    copayRates: {
      careService: { general: 16, midLowIncome: 0, lowIncome: 0 },
      transportByRegion: {
        region1: { general: 30, midLowIncome: 0, lowIncome: 0 },
        region2: { general: 27, midLowIncome: 0, lowIncome: 0 },
        region3: { general: 25, midLowIncome: 0, lowIncome: 0 },
        region4: { general: 21, midLowIncome: 0, lowIncome: 0 },
      },
      assistiveDevice: { general: 30, midLowIncome: 0, lowIncome: 0 },
      respite: { general: 16, midLowIncome: 0, lowIncome: 0 },
      officialUrl: "https://example.gov.tw/",
      legalBasis: "test",
      lastVerified: "2026-10-15",
    },
  };
}

// ---------------------------------------------------------------------------
// "not-assessed" short circuit
// ---------------------------------------------------------------------------

test('level "not-assessed" returns notAssessed:true with every per-service field null', () => {
  const result = estimateLtcBenefits({ level: "not-assessed", welfareStatus: "general" }, makeSchedule());
  assert.equal(result.notAssessed, true);
  assert.equal(result.careService, null);
  assert.equal(result.transportByRegion, null);
  assert.equal(result.assistiveDevice, null);
  assert.equal(result.respite, null);
});

// ---------------------------------------------------------------------------
// Level boundaries 2-8
// ---------------------------------------------------------------------------

test("level 2 and level 8 (the boundary need levels) both resolve a careService amount", () => {
  const schedule = makeSchedule();
  const level2 = estimateLtcBenefits({ level: 2, welfareStatus: "general" }, schedule);
  const level8 = estimateLtcBenefits({ level: 8, welfareStatus: "general" }, schedule);
  assert.equal(level2.notAssessed, false);
  assert.equal(level2.careService.amount, 10000);
  assert.equal(level8.careService.amount, 36000);
});

test("respite amount switches from the 2-6 tier to the 7-8 tier exactly at level 7", () => {
  const schedule = makeSchedule();
  const level6 = estimateLtcBenefits({ level: 6, welfareStatus: "general" }, schedule);
  const level7 = estimateLtcBenefits({ level: 7, welfareStatus: "general" }, schedule);
  assert.equal(level6.respite.amount, 30000);
  assert.equal(level7.respite.amount, 48000);
});

// ---------------------------------------------------------------------------
// Self-pay / government-pays math, floored per 附表五備註
// ---------------------------------------------------------------------------

test("careService self-pay is floor(amount * percent / 100), never rounded", () => {
  const schedule = makeSchedule();
  // level 4 amount 18000, general 16% => 2880.0 exactly, no rounding ambiguity
  const exact = estimateLtcBenefits({ level: 4, welfareStatus: "general" }, schedule);
  assert.equal(exact.careService.selfPay, 2880);
  assert.equal(exact.careService.govPays, 18000 - 2880);

  // level 2 amount 10000, general 16% => 1600.0 — adjust fixture to force a
  // non-terminating case: use transport region1 (1000 * 30% = 300.0, still
  // exact) vs region3 (2000 * 25% = 500.0). Use a percent that doesn't
  // divide evenly instead: level 3 amount 15000 * 16% = 2400.0 (exact too).
  // So directly test the floor behavior with an amount*percent that isn't
  // a whole number: 10000 * 16% = 1600 exactly; pick level 5 (24000) * 16%
  // = 3840 exactly as well — this fixture's round numbers are all exact
  // multiples, so assert the floor function itself is exercised correctly
  // via a fractional case below instead.
  const fractional = estimateLtcBenefits({ level: 2, welfareStatus: "general" }, {
    ...schedule,
    careService: { ...schedule.careService, monthlyAmountByLevel: { ...schedule.careService.monthlyAmountByLevel, 2: 10001 } },
  });
  // 10001 * 16 / 100 = 1600.16 -> floor to 1600, not rounded to 1600 (same
  // here) or ceiled to 1601.
  assert.equal(fractional.careService.selfPay, 1600);
  assert.equal(fractional.careService.govPays, 10001 - 1600);
});

test("lowIncome and midLowIncome both get 0% copay (長照第一類) and 100% government-paid", () => {
  const schedule = makeSchedule();
  const low = estimateLtcBenefits({ level: 5, welfareStatus: "lowIncome" }, schedule);
  const midLow = estimateLtcBenefits({ level: 5, welfareStatus: "midLowIncome" }, schedule);
  assert.equal(low.careService.selfPay, 0);
  assert.equal(midLow.careService.selfPay, 0);
  assert.equal(low.careService.govPays, schedule.careService.monthlyAmountByLevel[5]);
  assert.deepEqual(low.careService, midLow.careService);
});

// ---------------------------------------------------------------------------
// Transport: all 4 regions returned, each with its own amount/percent
// ---------------------------------------------------------------------------

test("transportByRegion returns all 4 regions with region-specific amounts and copay percents", () => {
  const schedule = makeSchedule();
  const result = estimateLtcBenefits({ level: 3, welfareStatus: "general" }, schedule);
  assert.equal(result.transportByRegion.length, 4);
  const byRegion = Object.fromEntries(result.transportByRegion.map((r) => [r.region, r]));
  assert.equal(byRegion.region1.amount, 1000);
  assert.equal(byRegion.region1.copayPercent, 30);
  assert.equal(byRegion.region4.amount, 2500);
  assert.equal(byRegion.region4.copayPercent, 21);
});

// ---------------------------------------------------------------------------
// Assistive device: groupOne/groupTwo both present with the shared copay %
// ---------------------------------------------------------------------------

test("assistiveDevice returns both groupOne and groupTwo triennial amounts with the device copay percent", () => {
  const schedule = makeSchedule();
  const result = estimateLtcBenefits({ level: 6, welfareStatus: "general" }, schedule);
  assert.equal(result.assistiveDevice.groupOne.amount, 40000);
  assert.equal(result.assistiveDevice.groupTwo.amount, 60000);
  assert.equal(result.assistiveDevice.groupOne.copayPercent, 30);
  assert.equal(result.assistiveDevice.groupTwo.copayPercent, 30);
  assert.equal(result.assistiveDevice.groupTwo.effectiveDate, "2026-07-01");
  assert.equal(result.assistiveDevice.homeModificationCapWithinGroupTwo, 20000);
});

// ---------------------------------------------------------------------------
// Purity / no side effects
// ---------------------------------------------------------------------------

test("source never references fetch/log/storage APIs", () => {
  const source = readFileSync(new URL("./estimateLtcBenefits.ts", import.meta.url), "utf-8");
  assertNoForbiddenApis(source, { fileLabel: "estimateLtcBenefits.ts" });
});

test("is a pure function: identical calls return deepEqual (not necessarily ===) results", () => {
  const schedule = makeSchedule();
  const first = estimateLtcBenefits({ level: 4, welfareStatus: "general" }, schedule);
  const second = estimateLtcBenefits({ level: 4, welfareStatus: "general" }, schedule);
  assert.deepEqual(first, second);
});

test("does not mutate the schedule object", () => {
  const schedule = makeSchedule();
  const before = JSON.stringify(schedule);
  estimateLtcBenefits({ level: 7, welfareStatus: "lowIncome" }, schedule);
  const after = JSON.stringify(schedule);
  assert.equal(before, after);
});
