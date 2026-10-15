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

const { matchChildSubsidies } = await import("./matchChildSubsidies.ts");
const { ALL_CARE_TYPES } = await import("./types.ts");

// ---------------------------------------------------------------------------
// Fixture rules — small, hand-built set covering every behavior under test
// (deliberately NOT importing the real data/child-subsidies.json, so these
// tests stay stable even as the real data file's amounts get re-verified
// every six months).
// ---------------------------------------------------------------------------

function makeRule(overrides = {}) {
  return {
    id: "base",
    name: "Base rule",
    agency: "Test Agency",
    ageRange: { minMonths: 0, maxMonths: 23 },
    amountsByParity: { first: 5000, second: 6000, thirdPlus: 7000 },
    careTypes: ["home-care"],
    welfareStatusBonus: { midLowIncome: null, lowIncome: null },
    notCombinableWith: [],
    status: "in-effect",
    officialUrl: "https://example.gov.tw/",
    lastVerified: "2026-10-14",
    ...overrides,
  };
}

const baseInput = { ageMonths: 12, careType: "home-care", parity: "first", welfareStatus: "general" };

// ---------------------------------------------------------------------------
// Age boundary: inclusive at both ends
// ---------------------------------------------------------------------------

test("age boundary: minMonths is inclusive", () => {
  const rule = makeRule({ id: "a", ageRange: { minMonths: 24, maxMonths: 59 } });
  const atMin = matchChildSubsidies({ ...baseInput, ageMonths: 24 }, [rule]);
  const belowMin = matchChildSubsidies({ ...baseInput, ageMonths: 23 }, [rule]);
  assert.equal(atMin.length, 1, "24 months should match a 24-59 range");
  assert.equal(belowMin.length, 0, "23 months should NOT match a 24-59 range");
});

test("age boundary: maxMonths is inclusive", () => {
  const rule = makeRule({ id: "a", ageRange: { minMonths: 24, maxMonths: 59 } });
  const atMax = matchChildSubsidies({ ...baseInput, ageMonths: 59 }, [rule]);
  const aboveMax = matchChildSubsidies({ ...baseInput, ageMonths: 60 }, [rule]);
  assert.equal(atMax.length, 1, "59 months should match a 24-59 range");
  assert.equal(aboveMax.length, 0, "60 months should NOT match a 24-59 range");
});

test("age boundary: maxMonths null means unbounded", () => {
  const rule = makeRule({ id: "a", ageRange: { minMonths: 0, maxMonths: null } });
  const result = matchChildSubsidies({ ...baseInput, ageMonths: 999 }, [rule]);
  assert.equal(result.length, 1);
});

// ---------------------------------------------------------------------------
// Parity-based amounts
// ---------------------------------------------------------------------------

test("parity: selects the right amountsByParity tier", () => {
  const rule = makeRule({ id: "a" });
  const first = matchChildSubsidies({ ...baseInput, parity: "first" }, [rule]);
  const second = matchChildSubsidies({ ...baseInput, parity: "second" }, [rule]);
  const thirdPlus = matchChildSubsidies({ ...baseInput, parity: "thirdPlus" }, [rule]);
  assert.equal(first[0].amount, 5000);
  assert.equal(second[0].amount, 6000);
  assert.equal(thirdPlus[0].amount, 7000);
});

// ---------------------------------------------------------------------------
// Welfare-status bonus stacking
// ---------------------------------------------------------------------------

test("welfare bonus: midLowIncome and lowIncome add on top of the parity amount", () => {
  const rule = makeRule({ id: "a", welfareStatusBonus: { midLowIncome: 2000, lowIncome: 4000 } });
  const general = matchChildSubsidies({ ...baseInput, welfareStatus: "general" }, [rule]);
  const midLow = matchChildSubsidies({ ...baseInput, welfareStatus: "midLowIncome" }, [rule]);
  const low = matchChildSubsidies({ ...baseInput, welfareStatus: "lowIncome" }, [rule]);
  assert.equal(general[0].amount, 5000);
  assert.equal(midLow[0].amount, 7000);
  assert.equal(low[0].amount, 9000);
});

test("welfare bonus: a null bonus counts as 0, not an error", () => {
  const rule = makeRule({ id: "a", welfareStatusBonus: { midLowIncome: null, lowIncome: null } });
  const low = matchChildSubsidies({ ...baseInput, welfareStatus: "lowIncome" }, [rule]);
  assert.equal(low[0].amount, 5000);
});

test("welfare bonus: a large negative offset floors the amount at 0, never negative", () => {
  // Models the quasi-public kindergarten fee-cap rules, where low-income
  // households pay nothing regardless of parity.
  const rule = makeRule({
    id: "a",
    amountsByParity: { first: 3000, second: 2000, thirdPlus: 1000 },
    welfareStatusBonus: { midLowIncome: -3000, lowIncome: -3000 },
  });
  for (const parity of ["first", "second", "thirdPlus"]) {
    const result = matchChildSubsidies({ ...baseInput, parity, welfareStatus: "lowIncome" }, [rule]);
    assert.equal(result[0].amount, 0, `parity ${parity} should floor to 0, not go negative`);
  }
});

// ---------------------------------------------------------------------------
// careType matching
// ---------------------------------------------------------------------------

test("careType: only matches rules whose careTypes include the input careType", () => {
  const rule = makeRule({ id: "a", careTypes: ["quasi-public-nursery"] });
  const matches = matchChildSubsidies({ ...baseInput, careType: "quasi-public-nursery" }, [rule]);
  const noMatch = matchChildSubsidies({ ...baseInput, careType: "home-care" }, [rule]);
  assert.equal(matches.length, 1);
  assert.equal(noMatch.length, 0);
});

// ---------------------------------------------------------------------------
// notCombinableWith mutual-exclusion filtering
// ---------------------------------------------------------------------------

test("notCombinableWith: drops the lower-value rule when two matched rules exclude each other", () => {
  const cheap = makeRule({
    id: "cheap",
    careTypes: ALL_CARE_TYPES,
    amountsByParity: { first: 1000, second: 1000, thirdPlus: 1000 },
    notCombinableWith: ["expensive"],
  });
  const expensive = makeRule({
    id: "expensive",
    careTypes: ALL_CARE_TYPES,
    amountsByParity: { first: 9000, second: 9000, thirdPlus: 9000 },
    notCombinableWith: ["cheap"],
  });
  const result = matchChildSubsidies(baseInput, [cheap, expensive]);
  assert.deepEqual(result.map((r) => r.rule.id), ["expensive"]);
});

test("notCombinableWith: a one-directional declaration still excludes (symmetry not required)", () => {
  const cheap = makeRule({
    id: "cheap",
    careTypes: ALL_CARE_TYPES,
    amountsByParity: { first: 1000, second: 1000, thirdPlus: 1000 },
    notCombinableWith: ["expensive"], // only cheap declares the exclusion
  });
  const expensive = makeRule({
    id: "expensive",
    careTypes: ALL_CARE_TYPES,
    amountsByParity: { first: 9000, second: 9000, thirdPlus: 9000 },
    notCombinableWith: [],
  });
  const result = matchChildSubsidies(baseInput, [cheap, expensive]);
  assert.deepEqual(result.map((r) => r.rule.id), ["expensive"]);
});

test("notCombinableWith: an excluded id that never matched this situation is a no-op", () => {
  const rule = makeRule({ id: "a", notCombinableWith: ["does-not-exist"] });
  const result = matchChildSubsidies(baseInput, [rule]);
  assert.equal(result.length, 1);
});

test("notCombinableWith: a tie is broken by original array order (earlier wins)", () => {
  const ruleA = makeRule({
    id: "a",
    careTypes: ALL_CARE_TYPES,
    amountsByParity: { first: 5000, second: 5000, thirdPlus: 5000 },
    notCombinableWith: ["b"],
  });
  const ruleB = makeRule({
    id: "b",
    careTypes: ALL_CARE_TYPES,
    amountsByParity: { first: 5000, second: 5000, thirdPlus: 5000 },
    notCombinableWith: ["a"],
  });
  const result = matchChildSubsidies(baseInput, [ruleA, ruleB]);
  assert.deepEqual(result.map((r) => r.rule.id), ["a"]);
});

// ---------------------------------------------------------------------------
// status !== "in-effect" never appears, even if passed in by mistake
// ---------------------------------------------------------------------------

test('status: an "announced" rule is never returned, even if it would otherwise match', () => {
  const announced = makeRule({
    id: "future",
    status: "announced",
    announcedDate: "2026-08-07",
    ageRange: { minMonths: 0, maxMonths: 216 },
    careTypes: ALL_CARE_TYPES,
  });
  const result = matchChildSubsidies(baseInput, [announced]);
  assert.equal(result.length, 0);
});

test('status: filters out "announced" rules while keeping "in-effect" ones from a mixed array', () => {
  const inEffect = makeRule({ id: "now", status: "in-effect" });
  const announced = makeRule({ id: "later", status: "announced", announcedDate: "2027-01-01" });
  const result = matchChildSubsidies(baseInput, [inEffect, announced]);
  assert.deepEqual(result.map((r) => r.rule.id), ["now"]);
});

// ---------------------------------------------------------------------------
// Purity / no side effects: static source check, the structural guarantee
// behind issue #604's privacy requirement.
// ---------------------------------------------------------------------------

test("source never references fetch/log/storage APIs", () => {
  const source = readFileSync(new URL("./matchChildSubsidies.ts", import.meta.url), "utf-8");
  assertNoForbiddenApis(source, { fileLabel: "matchChildSubsidies.ts" });
});

test("is a pure function: identical calls return deepEqual (not necessarily ===) results", () => {
  const rule = makeRule({ id: "a" });
  const first = matchChildSubsidies(baseInput, [rule]);
  const second = matchChildSubsidies(baseInput, [rule]);
  assert.deepEqual(first, second);
});

test("does not mutate the rules array or its entries", () => {
  const rule = makeRule({ id: "a" });
  const rules = [rule];
  const before = JSON.stringify(rules);
  matchChildSubsidies(baseInput, rules);
  const after = JSON.stringify(rules);
  assert.equal(before, after);
});
