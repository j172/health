// Issue #674 (B-16) / spec §4.2: rolling-snapshot reconciliation guard. After a
// city's stops are upserted, rows the run did not see are deleted — but only if
// the fetch looks complete. An empty or sharply smaller response (upstream
// outage, a maintenance page that happened to parse) must never wipe the table.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

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

const { decideSnapshotPrune, MIN_SNAPSHOT_RATIO } = await import("./reconcile.ts");

test("MIN_SNAPSHOT_RATIO is the spec's 50%", () => {
  assert.equal(MIN_SNAPSHOT_RATIO, 0.5);
});

test("first ever sync (no previous rows): nothing to prune, nothing suspicious", () => {
  assert.deepEqual(decideSnapshotPrune({ fetched: 4012, previousCount: 0 }), { prune: true });
});

test("same size or growth: prune the rows that disappeared", () => {
  assert.deepEqual(decideSnapshotPrune({ fetched: 4012, previousCount: 4012 }), { prune: true });
  assert.deepEqual(decideSnapshotPrune({ fetched: 5000, previousCount: 4012 }), { prune: true });
});

test("an empty response never prunes, even when the table was empty too", () => {
  const decision = decideSnapshotPrune({ fetched: 0, previousCount: 4012 });
  assert.equal(decision.prune, false);
  assert.match(decision.reason, /0|empty/i);
  assert.equal(decideSnapshotPrune({ fetched: 0, previousCount: 0 }).prune, false);
});

test("a response under 50% of the previous row count is treated as an anomalous source: no prune, reason recorded", () => {
  const decision = decideSnapshotPrune({ fetched: 2005, previousCount: 4012 });
  assert.equal(decision.prune, false);
  assert.match(decision.reason, /2005/);
  assert.match(decision.reason, /4012/);
});

test("exactly 50% is allowed (the guard is 'at least half')", () => {
  assert.equal(decideSnapshotPrune({ fetched: 2006, previousCount: 4012 }).prune, true);
  assert.equal(decideSnapshotPrune({ fetched: 50, previousCount: 100 }).prune, true);
  assert.equal(decideSnapshotPrune({ fetched: 49, previousCount: 100 }).prune, false);
});
