// Shared `node --test` helpers for the hand-maintained government
// subsidy/benefit data files (issue #604's child-subsidies, issue #615's
// ltc-benefits). Plain .mjs (no TS, no node:module loader hooks needed) so
// both domains' *.test.mjs files can import it directly.
//
// Factored out here per issue #615's acceptance criteria: #604 shipped its
// freshness-tripwire and "no fetch/log/storage" source check as copy-local
// logic in lib/server/childSubsidies/*.test.mjs; this ticket is the one
// responsible for extracting the genuinely shared parts instead of
// re-implementing them a second time for ltc-benefits.

import assert from "node:assert/strict";

export const MAX_STALE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Days elapsed since an ISO (`YYYY-MM-DD`) date, as of `Date.now()`. */
export function daysSince(isoDate) {
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  assert.ok(!Number.isNaN(then), `"${isoDate}" is not a valid ISO date`);
  return (Date.now() - then) / DAY_MS;
}

/**
 * Freshness tripwire: asserts every entry in `entries` has a
 * `getLastVerified(entry)` within `maxDays` of now. This is a recurring
 * check, not a one-time pass — once any entry's `lastVerified` drifts past
 * the limit, this starts failing on its own as time passes, forcing a
 * re-verification pass against `getSourceUrl(entry)` rather than letting a
 * stale amount sit quietly (issue #604's original rationale).
 *
 * `entries` may be a flat array of rule/item objects (child-subsidies'
 * shape) or any other array of "things with a lastVerified field" — e.g.
 * ltc-benefits' handful of named schedule sections, passed as
 * `Object.values(schedule)`.
 */
export function assertFreshness(
  entries,
  { getId, getLastVerified, getSourceUrl, maxDays = MAX_STALE_DAYS, label = "entries" },
) {
  assert.ok(Array.isArray(entries) && entries.length > 0, `${label} should not be empty`);
  for (const entry of entries) {
    const age = daysSince(getLastVerified(entry));
    assert.ok(
      age <= maxDays,
      `"${getId(entry)}" was last verified ${age.toFixed(0)} days ago (> ${maxDays}) — ` +
        `re-check ${getSourceUrl(entry)} and bump lastVerified`,
    );
  }
}

/**
 * Default set of APIs a pure, client-side-only matching/estimation
 * function must never reference — the structural guarantee behind both
 * issue #604's and issue #615's "nothing the user selects ever leaves the
 * browser" privacy requirement.
 */
export const FORBIDDEN_NETWORK_OR_STORAGE_APIS = [
  "fetch(",
  "console.",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "XMLHttpRequest",
];

/**
 * Static source-text check: asserts `sourceText` (read straight from disk,
 * never executed) contains none of `forbidden`. A stronger guarantee than
 * a runtime click-spy/mock, since it covers every code path in the file,
 * not just the ones a test happens to exercise.
 */
export function assertNoForbiddenApis(
  sourceText,
  { fileLabel, forbidden = FORBIDDEN_NETWORK_OR_STORAGE_APIS } = {},
) {
  for (const token of forbidden) {
    assert.ok(!sourceText.includes(token), `${fileLabel} must not reference "${token}"`);
  }
}
