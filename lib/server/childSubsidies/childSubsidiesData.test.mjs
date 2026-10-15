import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertFreshness } from "../subsidies/testSupport.mjs";

const DATA_PATH = fileURLToPath(new URL("../../../data/child-subsidies.json", import.meta.url));
const POLICY_WATCH_PATH = fileURLToPath(
  new URL("../../../data/child-subsidies-policy-watch.json", import.meta.url),
);

const rules = JSON.parse(readFileSync(DATA_PATH, "utf-8"));
const policyWatch = JSON.parse(readFileSync(POLICY_WATCH_PATH, "utf-8"));

// ---------------------------------------------------------------------------
// Freshness tripwire (issue #604): this is a recurring check, not a
// one-time pass — if `lastVerified` is ever allowed to drift past 180 days,
// this test starts failing on its own as time passes, forcing a
// re-verification pass against the official sources in each entry's
// `officialUrl`/`legalBasis` rather than letting stale amounts sit quietly.
// Shared with lib/server/ltcBenefits' own freshness tests (issue #615) via
// lib/server/subsidies/testSupport.mjs's `assertFreshness`.
// ---------------------------------------------------------------------------

test("every data/child-subsidies.json entry has a lastVerified within 180 days", () => {
  assertFreshness(rules, {
    getId: (rule) => rule.id,
    getLastVerified: (rule) => rule.lastVerified,
    getSourceUrl: (rule) => rule.officialUrl,
    label: "data/child-subsidies.json",
  });
});

test("every data/child-subsidies-policy-watch.json entry has a lastVerified within 180 days", () => {
  assertFreshness(policyWatch, {
    getId: (item) => item.id,
    getLastVerified: (item) => item.lastVerified,
    getSourceUrl: (item) => item.sourceUrl,
    label: "data/child-subsidies-policy-watch.json",
  });
});

test('every status === "announced" entry has an announcedDate', () => {
  for (const rule of rules) {
    if (rule.status === "announced") {
      assert.ok(
        typeof rule.announcedDate === "string" && rule.announcedDate.length > 0,
        `"${rule.id}" has status "announced" but no announcedDate`,
      );
    }
  }
});

test("data/child-subsidies.json has no announced-status entries today (all 7 current programs are in-effect)", () => {
  // Not a hard invariant of the schema (an "announced" status is explicitly
  // supported — see the test above), just today's actual data shape. If
  // this starts failing because a real "announced" entry was added here by
  // mistake, route it to data/child-subsidies-policy-watch.json instead —
  // that array is what the page's "已宣布、尚未上路" section reads, and the
  // one matchChildSubsidies must never receive.
  const announced = rules.filter((rule) => rule.status === "announced");
  assert.deepEqual(announced, []);
});

test("every id referenced in notCombinableWith exists in the array", () => {
  const ids = new Set(rules.map((rule) => rule.id));
  for (const rule of rules) {
    for (const referencedId of rule.notCombinableWith) {
      assert.ok(
        ids.has(referencedId),
        `"${rule.id}".notCombinableWith references "${referencedId}", which doesn't exist in data/child-subsidies.json`,
      );
    }
  }
});

test("every rule id is unique", () => {
  const ids = rules.map((rule) => rule.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate id in data/child-subsidies.json");
});

test("every policyWatch id is unique and does not collide with a rule id", () => {
  const watchIds = policyWatch.map((item) => item.id);
  assert.equal(new Set(watchIds).size, watchIds.length, "duplicate id in data/child-subsidies-policy-watch.json");

  const ruleIds = new Set(rules.map((rule) => rule.id));
  for (const id of watchIds) {
    assert.ok(!ruleIds.has(id), `policyWatch id "${id}" collides with a data/child-subsidies.json rule id`);
  }
});

test("every policyWatch entry has a non-empty sourceUrl and a proposedBy of executive or legislative", () => {
  for (const item of policyWatch) {
    assert.ok(typeof item.sourceUrl === "string" && item.sourceUrl.startsWith("http"), `"${item.id}" sourceUrl`);
    assert.ok(
      item.proposedBy === "executive" || item.proposedBy === "legislative",
      `"${item.id}" proposedBy must be "executive" or "legislative", got "${item.proposedBy}"`,
    );
  }
});

test("every rule has status in-effect or announced, a valid officialUrl, and well-formed ageRange", () => {
  for (const rule of rules) {
    assert.ok(
      rule.status === "in-effect" || rule.status === "announced",
      `"${rule.id}" has an invalid status "${rule.status}"`,
    );
    assert.ok(typeof rule.officialUrl === "string" && rule.officialUrl.startsWith("http"), `"${rule.id}" officialUrl`);
    assert.ok(Number.isInteger(rule.ageRange.minMonths) && rule.ageRange.minMonths >= 0, `"${rule.id}" ageRange.minMonths`);
    assert.ok(
      rule.ageRange.maxMonths === null || Number.isInteger(rule.ageRange.maxMonths),
      `"${rule.id}" ageRange.maxMonths`,
    );
    if (rule.ageRange.maxMonths !== null) {
      assert.ok(rule.ageRange.minMonths <= rule.ageRange.maxMonths, `"${rule.id}" ageRange min > max`);
    }
    assert.ok(Array.isArray(rule.careTypes) && rule.careTypes.length > 0, `"${rule.id}" careTypes`);
    for (const key of ["first", "second", "thirdPlus"]) {
      assert.ok(
        typeof rule.amountsByParity[key] === "number" && rule.amountsByParity[key] >= 0,
        `"${rule.id}" amountsByParity.${key}`,
      );
    }
  }
});
