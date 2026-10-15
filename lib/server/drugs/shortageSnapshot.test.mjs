import test from "node:test";
import assert from "node:assert/strict";

const {
  decideSnapshotReconcile,
  SNAPSHOT_MIN_KEEP_RATIO,
  SNAPSHOT_GUARD_MIN_BASELINE,
} = await import("./shortageSnapshot.ts");

test("constants: keep at least half of the previous snapshot, guard applies from a baseline of 20 rows", () => {
  assert.equal(SNAPSHOT_MIN_KEEP_RATIO, 0.5);
  assert.equal(SNAPSHOT_GUARD_MIN_BASELINE, 20);
});

test("normal week: a similar-sized snapshot reconciles (stale rows are deleted)", () => {
  assert.deepEqual(decideSnapshotReconcile({ fetched: 238, existing: 240, noDataPlaceholder: false }), { reconcile: true });
  assert.deepEqual(decideSnapshotReconcile({ fetched: 238, existing: 238, noDataPlaceholder: false }), { reconcile: true });
});

test("first run on an empty table: nothing to delete, reconcile is trivially allowed", () => {
  assert.deepEqual(decideSnapshotReconcile({ fetched: 238, existing: 0, noDataPlaceholder: false }), { reconcile: true });
  assert.deepEqual(decideSnapshotReconcile({ fetched: 0, existing: 0, noDataPlaceholder: true }), { reconcile: true });
});

test("a drastic shrink (< 50% of the previous snapshot) is treated as a broken source: do not delete, say why", () => {
  const decision = decideSnapshotReconcile({ fetched: 100, existing: 238, noDataPlaceholder: false });
  assert.equal(decision.reconcile, false);
  assert.match(decision.reason, /100/);
  assert.match(decision.reason, /238/);

  // Exactly at the boundary (ceil(238 * 0.5) = 119) is allowed.
  assert.equal(decideSnapshotReconcile({ fetched: 119, existing: 238, noDataPlaceholder: false }).reconcile, true);
  assert.equal(decideSnapshotReconcile({ fetched: 118, existing: 238, noDataPlaceholder: false }).reconcile, false);
});

test("an empty response against a populated table never wipes it, even when it carries the 沒有資料 placeholder and the table is large", () => {
  const empty = decideSnapshotReconcile({ fetched: 0, existing: 238, noDataPlaceholder: false });
  assert.equal(empty.reconcile, false);
  const placeholder = decideSnapshotReconcile({ fetched: 0, existing: 238, noDataPlaceholder: true });
  assert.equal(placeholder.reconcile, false);
});

test("small tables (below the baseline) may shrink freely, so a short list such as 54505 can go back to empty via the explicit placeholder", () => {
  // 3 rows -> upstream says "沒有資料": authoritative empty, clear the rows.
  assert.deepEqual(decideSnapshotReconcile({ fetched: 0, existing: 3, noDataPlaceholder: true }), { reconcile: true });
  // 15 rows -> 2 rows: below the baseline the 50% rule does not apply.
  assert.deepEqual(decideSnapshotReconcile({ fetched: 2, existing: 15, noDataPlaceholder: false }), { reconcile: true });
  // ...but an empty response WITHOUT the placeholder is still anomalous (could be an outage page).
  const outage = decideSnapshotReconcile({ fetched: 0, existing: 3, noDataPlaceholder: false });
  assert.equal(outage.reconcile, false);
  assert.match(outage.reason, /empty/i);
});
