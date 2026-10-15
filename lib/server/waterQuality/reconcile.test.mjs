// Issue #673: snapshot-reconcile guard (spec §4 item 2). A latest-state table
// that mirrors a whole upstream snapshot may delete rows the snapshot no longer
// contains, but only when this run's snapshot looks complete — a truncated or
// error-page response must never wipe the table.
import test from "node:test";
import assert from "node:assert/strict";

const { planSnapshotReconcile } = await import("./reconcile.ts");

test("planSnapshotReconcile: first ever sync (empty table) is allowed — there is nothing stale to delete", () => {
  assert.deepEqual(planSnapshotReconcile({ fetchedCount: 340, existingCount: 0 }), { shouldDelete: true, reason: null });
});

test("planSnapshotReconcile: a full or slightly smaller snapshot is allowed to delete the rows it no longer contains", () => {
  assert.equal(planSnapshotReconcile({ fetchedCount: 340, existingCount: 340 }).shouldDelete, true);
  assert.equal(planSnapshotReconcile({ fetchedCount: 336, existingCount: 340 }).shouldDelete, true);
});

test("planSnapshotReconcile: exactly 50% of the previous row count is still allowed; one row fewer is not", () => {
  assert.equal(planSnapshotReconcile({ fetchedCount: 170, existingCount: 340 }).shouldDelete, true);
  const refused = planSnapshotReconcile({ fetchedCount: 169, existingCount: 340 });
  assert.equal(refused.shouldDelete, false);
  assert.equal(refused.reason, "below_min_ratio");
});

test("planSnapshotReconcile: an empty snapshot never deletes, whatever the table holds", () => {
  const refused = planSnapshotReconcile({ fetchedCount: 0, existingCount: 340 });
  assert.equal(refused.shouldDelete, false);
  assert.equal(refused.reason, "empty_snapshot");
  assert.equal(planSnapshotReconcile({ fetchedCount: 0, existingCount: 0 }).shouldDelete, false);
});

test("planSnapshotReconcile: the ratio is overridable", () => {
  assert.equal(planSnapshotReconcile({ fetchedCount: 80, existingCount: 100, minRatio: 0.9 }).shouldDelete, false);
  assert.equal(planSnapshotReconcile({ fetchedCount: 90, existingCount: 100, minRatio: 0.9 }).shouldDelete, true);
});
