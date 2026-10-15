import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Live 2026-10-15: re-running scripts/import-mohw-ltc-gis.mjs against
// production (fixing issue #600's "long-term-care category filters all
// return 0" bug) crashed twice in a row on an unrelated batch with
// "SyntaxError: Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON" —
// a transient HTML error page from the host under its documented
// noisy-neighbor resource contention (docs/domains/11-hosting-ops-incidents.md),
// not an application-level failure. The script has no process-level
// resumability (each run resubmits all batches from the start), so one blip
// on any batch aborted the whole run and left later batches unsubmitted.
// submitBatch() can't be imported directly for a behavioral test — this
// module calls `main()` at import time as a side effect — so this is a
// source-text check, matching this repo's established convention for
// script-level logic that isn't practical to unit test without a live
// server (see tests/tdx-429-retry.test.mjs's equivalent source check).

const src = fs.readFileSync(new URL("../scripts/import-mohw-ltc-gis.mjs", import.meta.url), "utf8");

test("submitBatch retries a network error instead of aborting the whole import", () => {
  assert.match(src, /catch \(networkError\)/);
  assert.match(src, /if \(attempt >= maxRetries\) throw networkError;/);
});

test("submitBatch retries a non-JSON (HTML error page) response instead of crashing on JSON.parse", () => {
  assert.match(src, /JSON\.parse\(text\)/, "must parse the body manually (not res.json()) so a parse failure is catchable, not an uncaught throw");
  assert.match(src, /Non-JSON body: a transient HTML error page/);
});

test("a genuine application-level failure (res.ok but json.ok === false) is still not retried", () => {
  assert.match(src, /if \(!res\.ok \|\| !json\.ok\) \{\s*\n\s*throw new Error\(`Import batch failed/);
});
