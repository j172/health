import test from "node:test";
import assert from "node:assert/strict";

import { diffFlatSettings, reconcileManagedRules, reconcileAllManagedRules, hasAnyChanges } from "./diff.mjs";

test("diffFlatSettings: no changes when desired matches live", () => {
  const changes = diffFlatSettings({ ssl: "strict", brotli: "on" }, { ssl: "strict", brotli: "on" });
  assert.deepEqual(changes, []);
});

test("diffFlatSettings: reports each differing key with from/to", () => {
  const changes = diffFlatSettings({ ssl: "strict", brotli: "on" }, { ssl: "flexible", brotli: "on" });
  assert.deepEqual(changes, [{ key: "ssl", from: "flexible", to: "strict" }]);
});

test("diffFlatSettings: a live value missing entirely is treated as drift, not a crash", () => {
  const changes = diffFlatSettings({ ssl: "strict" }, {});
  assert.deepEqual(changes, [{ key: "ssl", from: null, to: "strict" }]);
});

test("diffFlatSettings: recurses into nested objects with dotted keys", () => {
  const changes = diffFlatSettings(
    { minify: { css: "off", html: "off", js: "off" } },
    { minify: { css: "on", html: "off", js: "off" } },
  );
  assert.deepEqual(changes, [{ key: "minify.css", from: "on", to: "off" }]);
});

test("reconcileManagedRules: preserves an unmanaged live rule (e.g. the SemrushBot/AhrefsBot block) untouched", () => {
  const desired = [{ ref: "health-repo:block-high-threat", action: "block" }];
  const live = [
    { id: "375d8e07c0c442caba42a540eb3b9069", description: "Block Semrush/Ahrefs", action: "block" },
    { ref: "health-repo:block-high-threat", action: "block" },
  ];

  const result = reconcileManagedRules(desired, live);

  assert.equal(result.added.length, 0);
  assert.equal(result.updated.length, 0);
  assert.equal(result.removed.length, 0);
  assert.equal(result.unmanagedPreserved.length, 1);
  assert.equal(result.unmanagedPreserved[0].id, "375d8e07c0c442caba42a540eb3b9069");
  // The unmanaged rule must still be present, unmodified, in the rebuilt list.
  assert.ok(result.nextRuleList.some((r) => r.id === "375d8e07c0c442caba42a540eb3b9069"));
  assert.equal(result.nextRuleList.length, 2);
});

test("reconcileManagedRules: detects an added managed rule not yet live", () => {
  const desired = [{ ref: "health-repo:new-rule", action: "block" }];
  const result = reconcileManagedRules(desired, []);
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].ref, "health-repo:new-rule");
  assert.deepEqual(result.nextRuleList, desired);
});

test("reconcileManagedRules: detects a changed managed rule", () => {
  const desired = [{ ref: "health-repo:x", action: "block" }];
  const live = [{ ref: "health-repo:x", action: "managed_challenge" }];
  const result = reconcileManagedRules(desired, live);
  assert.equal(result.updated.length, 1);
  assert.equal(result.updated[0].ref, "health-repo:x");
});

test("reconcileManagedRules: detects a managed rule removed from zone-settings.json", () => {
  const live = [{ ref: "health-repo:stale", action: "block" }];
  const result = reconcileManagedRules([], live);
  assert.equal(result.removed.length, 1);
  assert.equal(result.removed[0].ref, "health-repo:stale");
  // A previously-managed rule that's gone from the file is dropped from the rebuilt list.
  assert.equal(result.nextRuleList.length, 0);
});

test("reconcileManagedRules: a live rule with no ref at all is unmanaged and preserved", () => {
  const live = [{ id: "abc123", action: "block" }];
  const result = reconcileManagedRules([], live);
  assert.equal(result.unmanagedPreserved.length, 1);
  assert.equal(result.nextRuleList.length, 1);
});

test("reconcileManagedRules: adoptsLiveRuleId excludes exactly that one live unmanaged rule from unmanagedPreserved, leaving others untouched", () => {
  const desired = [
    { ref: "health-repo:limit-bot-traffic", action: "block", adoptsLiveRuleId: "7d45ce60945c4efa8321feff7a38456a" },
  ];
  const live = [
    { id: "7d45ce60945c4efa8321feff7a38456a", description: "Rate limit API and admin routes", action: "block" },
    { id: "375d8e07c0c442caba42a540eb3b9069", description: "Block Semrush/Ahrefs", action: "block" },
  ];

  const result = reconcileManagedRules(desired, live);

  assert.equal(result.added.length, 1, "the merged managed rule is new, so it's an addition");
  // The adopted rule's id must not appear in unmanagedPreserved — it's being
  // replaced, not kept alongside the new managed rule.
  assert.ok(!result.unmanagedPreserved.some((r) => r.id === "7d45ce60945c4efa8321feff7a38456a"));
  // Every other unmanaged rule is still preserved exactly as before.
  assert.equal(result.unmanagedPreserved.length, 1);
  assert.equal(result.unmanagedPreserved[0].id, "375d8e07c0c442caba42a540eb3b9069");
  // The rebuilt list has the preserved unmanaged rule plus the new managed
  // rule — the adopted rule's old entry is gone, not duplicated.
  assert.equal(result.nextRuleList.length, 2);
  // adoptsLiveRuleId is a repo-only migration sentinel, never a real
  // Cloudflare rule field — it must not leak into the PUT payload.
  assert.ok(!("adoptsLiveRuleId" in result.nextRuleList.find((r) => r.ref === "health-repo:limit-bot-traffic")));
});

test("reconcileManagedRules: once an adopted rule is live under its new ref, re-running no longer reports it as 'updated' forever (adoptsLiveRuleId must not poison the comparison)", () => {
  const desired = [
    { ref: "health-repo:limit-bot-traffic", action: "block", adoptsLiveRuleId: "7d45ce60945c4efa8321feff7a38456a" },
  ];
  // Simulate a second plan run after the first apply already put this exact
  // rule (minus the sentinel field, which apply never sends) live.
  const live = [{ ref: "health-repo:limit-bot-traffic", action: "block" }];

  const result = reconcileManagedRules(desired, live);

  assert.equal(result.added.length, 0);
  assert.equal(result.updated.length, 0, "must not report drift caused only by the adoptsLiveRuleId sentinel");
});

test("reconcileAllManagedRules + hasAnyChanges: no drift across every category", () => {
  const desired = { cacheRules: [{ ref: "health-repo:a" }], wafCustomRules: [] };
  const live = { cacheRules: [{ ref: "health-repo:a" }], wafCustomRules: [] };
  const reconciliation = reconcileAllManagedRules(desired, live);
  assert.equal(hasAnyChanges({ flatSettingsChanges: [], ruleReconciliation: reconciliation }), false);
});

test("hasAnyChanges: true when a flat setting differs", () => {
  const reconciliation = reconcileAllManagedRules({ cacheRules: [] }, { cacheRules: [] });
  assert.equal(
    hasAnyChanges({ flatSettingsChanges: [{ key: "ssl", from: "flexible", to: "strict" }], ruleReconciliation: reconciliation }),
    true,
  );
});

test("hasAnyChanges: true when a rule category has an addition", () => {
  const reconciliation = reconcileAllManagedRules({ cacheRules: [{ ref: "health-repo:a" }] }, { cacheRules: [] });
  assert.equal(hasAnyChanges({ flatSettingsChanges: [], ruleReconciliation: reconciliation }), true);
});
