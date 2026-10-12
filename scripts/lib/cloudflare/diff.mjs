/**
 * Pure diff/reconciliation logic for the Cloudflare config-as-code flow
 * (issue #454). Nothing in this file makes a network call — that separation
 * is deliberate so these rules can be unit-tested (scripts/lib/cloudflare/diff.test.mjs)
 * without a live zone, and so the plan and apply scripts share identical
 * diffing logic (the apply script re-diffs right before applying, so it
 * never acts on a stale plan).
 */

/**
 * Flat key/value diff for simple on/off-style settings (zoneSettings,
 * tieredCache, crawlerHints, botManagement). `desired` and `live` are plain
 * objects with the same shape; non-setting metadata fields (e.g. `note`)
 * should already be stripped by the caller.
 *
 * Returns an array of { key, from, to } for every key whose live value
 * differs from the desired value. An empty array means "nothing to change".
 */
export function diffFlatSettings(desired, live) {
  const changes = [];
  for (const key of Object.keys(desired)) {
    const desiredValue = desired[key];
    const liveValue = live?.[key];
    if (typeof desiredValue === "object" && desiredValue !== null && !Array.isArray(desiredValue)) {
      changes.push(...diffFlatSettings(desiredValue, liveValue || {}).map((c) => ({ ...c, key: `${key}.${c.key}` })));
      continue;
    }
    if (desiredValue !== liveValue) {
      changes.push({ key, from: liveValue ?? null, to: desiredValue });
    }
  }
  return changes;
}

/**
 * Reconciles one managed rule list (e.g. managedRules.wafCustomRules) against
 * the live rules currently in that Cloudflare ruleset phase.
 *
 * The core safety property (directly required by issue #454's acceptance
 * criteria and docs/2.0/spec-issue-438.md §T's "must not be lost on import"
 * note about the live SemrushBot/AhrefsBot block, rule id
 * 375d8e07c0c442caba42a540eb3b9069): a live rule is only ever touched if its
 * `ref` matches a `health-repo:*` tag this file manages. Every other live
 * rule — anything added by hand in the dashboard, or pre-existing before
 * this tooling existed — is preserved byte-for-byte and kept in its
 * original relative position. This function never produces a rule list
 * that drops a live rule it doesn't recognize.
 *
 * @param {Array<{ref: string, [key: string]: unknown}>} desiredRules - from zone-settings.json
 * @param {Array<{ref?: string, [key: string]: unknown}>} liveRules - from the Cloudflare API for this phase
 * @returns {{
 *   added: object[],
 *   updated: Array<{ref: string, from: object, to: object}>,
 *   removed: object[],
 *   unmanagedPreserved: object[],
 *   nextRuleList: object[],
 * }}
 */
export function reconcileManagedRules(desiredRules, liveRules) {
  const liveByRef = new Map(liveRules.filter((r) => r.ref).map((r) => [r.ref, r]));
  const desiredByRef = new Map(desiredRules.map((r) => [r.ref, r]));

  const added = desiredRules.filter((r) => !liveByRef.has(r.ref));
  const updated = desiredRules
    .filter((r) => liveByRef.has(r.ref))
    .map((r) => ({ ref: r.ref, from: liveByRef.get(r.ref), to: r }))
    .filter(({ from, to }) => JSON.stringify(from) !== JSON.stringify(to));

  // A "removed" managed rule is one this file used to manage (its ref is
  // health-repo:* and it's live) but is no longer listed in zone-settings.json.
  const removed = liveRules.filter(
    (r) => r.ref && r.ref.startsWith("health-repo:") && !desiredByRef.has(r.ref),
  );

  const unmanagedPreserved = liveRules.filter((r) => !r.ref || !r.ref.startsWith("health-repo:"));

  // Rebuild the full rule list the apply step would PUT for this phase:
  // unmanaged live rules keep their original relative order and position
  // first (so a hand-added rule that was meant to run before everything
  // else, like a bot block, still does), followed by this file's managed
  // rules in the order zone-settings.json lists them. Rules in `removed`
  // are dropped on purpose — that's the one case this file is allowed to
  // delete a live rule, because it was this file that created it.
  const nextRuleList = [...unmanagedPreserved, ...desiredRules];

  return { added, updated, removed, unmanagedPreserved, nextRuleList };
}

/**
 * Runs reconcileManagedRules() over every rule category in managedRules and
 * returns a single summary plus a per-phase apply plan, for the plan/apply
 * scripts to report and act on respectively.
 *
 * @param {object} desiredManagedRules - zoneSettingsFile.managedRules
 * @param {Record<string, object[]>} liveRulesByCategory - same keys as managedRules, live rules per phase
 */
export function reconcileAllManagedRules(desiredManagedRules, liveRulesByCategory) {
  const result = {};
  for (const category of Object.keys(desiredManagedRules)) {
    result[category] = reconcileManagedRules(
      desiredManagedRules[category],
      liveRulesByCategory[category] || [],
    );
  }
  return result;
}

/**
 * True if a full reconciliation result (plan) has no actual changes to make —
 * used by both the plan script (to report "no drift") and the apply script
 * (to skip calling any mutating endpoint when there's nothing to do).
 */
export function hasAnyChanges({ flatSettingsChanges, ruleReconciliation }) {
  if (flatSettingsChanges.length > 0) return true;
  return Object.values(ruleReconciliation).some(
    (r) => r.added.length > 0 || r.updated.length > 0 || r.removed.length > 0,
  );
}
