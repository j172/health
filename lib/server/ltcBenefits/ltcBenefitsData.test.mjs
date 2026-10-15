import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFreshness } from "../subsidies/testSupport.mjs";

const SCHEDULE_PATH = fileURLToPath(new URL("../../../data/ltc-benefits.json", import.meta.url));
const UPDATES_PATH = fileURLToPath(new URL("../../../data/ltc-3-0-updates.json", import.meta.url));

const schedule = JSON.parse(readFileSync(SCHEDULE_PATH, "utf-8"));
const updates = JSON.parse(readFileSync(UPDATES_PATH, "utf-8"));

const LEVELS = [2, 3, 4, 5, 6, 7, 8];
const REGIONS = ["region1", "region2", "region3", "region4"];
const WELFARE_STATUSES = ["general", "midLowIncome", "lowIncome"];
const SCHEDULE_SECTIONS = ["careService", "transport", "assistiveDevice", "respite", "copayRates"];

// ---------------------------------------------------------------------------
// Freshness tripwire (issue #604's pattern, factored out in issue #615 —
// see lib/server/subsidies/testSupport.mjs). Every one of
// data/ltc-benefits.json's 5 named sections, plus every
// data/ltc-3-0-updates.json entry, carries its own lastVerified/officialUrl.
// ---------------------------------------------------------------------------

test("every data/ltc-benefits.json section has a lastVerified within 180 days", () => {
  const sections = SCHEDULE_SECTIONS.map((key) => ({ key, ...schedule[key] }));
  assertFreshness(sections, {
    getId: (section) => `data/ltc-benefits.json:${section.key}`,
    getLastVerified: (section) => section.lastVerified,
    getSourceUrl: (section) => section.officialUrl,
    label: "data/ltc-benefits.json sections",
  });
});

test("every data/ltc-3-0-updates.json entry has a lastVerified within 180 days", () => {
  assertFreshness(updates, {
    getId: (item) => item.id,
    getLastVerified: (item) => item.lastVerified,
    getSourceUrl: (item) => item.officialUrl,
    label: "data/ltc-3-0-updates.json",
  });
});

// ---------------------------------------------------------------------------
// data/ltc-benefits.json structural checks
// ---------------------------------------------------------------------------

test("data/ltc-benefits.json has all 5 expected sections, each with officialUrl/legalBasis/lastVerified", () => {
  for (const key of SCHEDULE_SECTIONS) {
    const section = schedule[key];
    assert.ok(section, `schedule.${key} must exist`);
    assert.ok(typeof section.officialUrl === "string" && section.officialUrl.startsWith("http"), `schedule.${key}.officialUrl`);
    assert.ok(typeof section.legalBasis === "string" && section.legalBasis.length > 0, `schedule.${key}.legalBasis`);
    assert.ok(typeof section.lastVerified === "string", `schedule.${key}.lastVerified`);
  }
});

test("careService.monthlyAmountByLevel covers levels 2-8 with positive, non-decreasing amounts", () => {
  const amounts = LEVELS.map((level) => schedule.careService.monthlyAmountByLevel[String(level)]);
  for (const amount of amounts) {
    assert.ok(Number.isInteger(amount) && amount > 0, `careService amount ${amount} must be a positive integer`);
  }
  for (let i = 1; i < amounts.length; i++) {
    assert.ok(amounts[i] >= amounts[i - 1], "careService amounts must not decrease as the need level rises");
  }
});

test("respite.annualAmountByLevel is 32340 for levels 2-6 and 48510 for levels 7-8 (附表二)", () => {
  for (const level of [2, 3, 4, 5, 6]) {
    assert.equal(schedule.respite.annualAmountByLevel[String(level)], 32340, `level ${level}`);
  }
  for (const level of [7, 8]) {
    assert.equal(schedule.respite.annualAmountByLevel[String(level)], 48510, `level ${level}`);
  }
});

test("transport.monthlyAmountByRegion covers all 4 regions with positive amounts and a regionExamples label each", () => {
  for (const region of REGIONS) {
    const amount = schedule.transport.monthlyAmountByRegion[region];
    assert.ok(Number.isInteger(amount) && amount > 0, `transport amount for ${region}`);
    assert.ok(
      typeof schedule.transport.regionExamples[region] === "string" && schedule.transport.regionExamples[region].length > 0,
      `transport.regionExamples.${region}`,
    );
  }
});

test("assistiveDevice has positive groupOne/groupTwo triennial amounts and a home-modification cap within groupTwo", () => {
  assert.ok(schedule.assistiveDevice.triennialAmount.groupOne > 0);
  assert.ok(schedule.assistiveDevice.triennialAmount.groupTwo > 0);
  assert.ok(schedule.assistiveDevice.homeModificationCapWithinGroupTwo > 0);
  assert.ok(
    schedule.assistiveDevice.homeModificationCapWithinGroupTwo <= schedule.assistiveDevice.triennialAmount.groupTwo,
    "the home-modification cap must not exceed the groupTwo triennial amount it's carved out of",
  );
  assert.equal(schedule.assistiveDevice.groupTwoEffectiveDate, "2026-07-01");
});

test("every copay percentage is a number in [0, 100], and lowIncome/midLowIncome are both 0 (長照第一類, 辦法第14條)", () => {
  const rateGroups = [
    schedule.copayRates.careService,
    ...REGIONS.map((region) => schedule.copayRates.transportByRegion[region]),
    schedule.copayRates.assistiveDevice,
    schedule.copayRates.respite,
  ];
  for (const rates of rateGroups) {
    for (const status of WELFARE_STATUSES) {
      const percent = rates[status];
      assert.ok(
        typeof percent === "number" && percent >= 0 && percent <= 100,
        `copay percent ${percent} for ${status} must be in [0, 100]`,
      );
    }
    // 辦法第14條: 列冊之低收入戶、中低收入戶 are both "長照第一類" — same rate.
    // This is deliberate, not a bug — see copayRates.notes and
    // lib/server/subsidies/types.ts's WelfareStatus doc comment.
    assert.equal(rates.lowIncome, rates.midLowIncome, "lowIncome and midLowIncome must match (both 長照第一類)");
    assert.ok(rates.general >= rates.midLowIncome, "general household copay must be >= the means-tested rate");
  }
});

// ---------------------------------------------------------------------------
// data/ltc-3-0-updates.json structural checks
// ---------------------------------------------------------------------------

test("every ltc-3-0-updates.json id is unique", () => {
  const ids = updates.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in data/ltc-3-0-updates.json");
});

test("every inEffect:true entry has a non-null ISO effectiveDate; inEffect:false entries may be null", () => {
  for (const item of updates) {
    if (item.inEffect) {
      assert.ok(
        typeof item.effectiveDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.effectiveDate),
        `"${item.id}" is inEffect but has no valid ISO effectiveDate`,
      );
    }
  }
});

test("at least 3 inEffect entries (114-09-01 / 115-01-01 / 115-07-01) and at least 1 planned (規劃中) entry", () => {
  const inEffect = updates.filter((item) => item.inEffect);
  const planned = updates.filter((item) => !item.inEffect);
  assert.ok(inEffect.length >= 3, `expected >= 3 in-effect 長照3.0 items, got ${inEffect.length}`);
  assert.ok(planned.length >= 1, `expected >= 1 planned (規劃中) 長照3.0 item, got ${planned.length}`);

  const effectiveDates = inEffect.map((item) => item.effectiveDate).sort();
  assert.deepEqual(effectiveDates, ["2025-09-01", "2026-01-01", "2026-07-01"]);
});

test("every entry has a non-empty officialUrl starting with http", () => {
  for (const item of updates) {
    assert.ok(typeof item.officialUrl === "string" && item.officialUrl.startsWith("http"), `"${item.id}" officialUrl`);
  }
});
