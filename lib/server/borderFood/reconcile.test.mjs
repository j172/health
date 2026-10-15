// Snapshot-reconciliation guard (docs/2.0/track-b-opendata-phase2-3-spec.md §4
// item 2): the border-food table is a rolling snapshot, so a sync deletes
// rows the upstream no longer lists — but only after proving the response is
// a plausible full snapshot. A truncated / empty / blocked response must
// never be allowed to wipe the table.
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

const { evaluateSnapshotGuard, MIN_SNAPSHOT_RATIO } = await import("./reconcile.ts");

test("MIN_SNAPSHOT_RATIO is 50% (spec §4 item 2)", () => {
  assert.equal(MIN_SNAPSHOT_RATIO, 0.5);
});

test("an empty response is always rejected, even on the very first run", () => {
  assert.equal(evaluateSnapshotGuard(0, 0).ok, false);
  assert.equal(evaluateSnapshotGuard(0, 2626).ok, false);
  assert.match(evaluateSnapshotGuard(0, 2626).reason, /0 rows|empty/i);
});

test("the first run into an empty table accepts any non-empty snapshot", () => {
  assert.deepEqual(evaluateSnapshotGuard(2626, 0), { ok: true, reason: null });
  assert.equal(evaluateSnapshotGuard(1, 0).ok, true);
});

test("a snapshot of at least half the previous row count is accepted (normal rolling-window drift)", () => {
  assert.equal(evaluateSnapshotGuard(2626, 2626).ok, true);
  assert.equal(evaluateSnapshotGuard(2500, 2626).ok, true);
  assert.equal(evaluateSnapshotGuard(1313, 2626).ok, true); // exactly 50%
  assert.equal(evaluateSnapshotGuard(3000, 2626).ok, true); // growth is always fine
});

test("a snapshot below half the previous row count is rejected with an explanatory reason", () => {
  const verdict = evaluateSnapshotGuard(1312, 2626);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /1312/);
  assert.match(verdict.reason, /2626/);
  assert.equal(evaluateSnapshotGuard(10, 2626).ok, false);
});
