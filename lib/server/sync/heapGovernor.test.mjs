import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const { createHeapGovernor, resolveGc } = await import("./heapGovernor.ts");

/** A governor wired to fake memory, a fake clock and a fake collector. */
const fakeGovernor = (options = {}) => {
  const state = { heapUsedMb: 20, rssMb: 200, nowMs: 10_000, collected: 0 };
  const governor = createHeapGovernor({
    gc: () => {
      state.collected += 1;
      state.heapUsedMb = state.afterGcHeapMb ?? 20;
      state.rssMb = state.afterGcRssMb ?? state.rssMb;
    },
    now: () => state.nowMs,
    readMemory: () => ({ heapUsedMb: state.heapUsedMb, rssMb: state.rssMb }),
    ...options,
  });
  return { governor, state };
};

test("does nothing while the heap and RSS stay inside their budgets", () => {
  const { governor, state } = fakeGovernor({ heapGrowthBudgetMb: 48, rssGrowthBudgetMb: 96 });
  state.heapUsedMb = 20 + 47;
  state.rssMb = 200 + 95;
  assert.equal(governor.maybeCollect(), null);
  assert.equal(state.collected, 0);
  assert.equal(governor.collections, 0);
});

test("collects once the heap has grown by the budget, and reports before/after", () => {
  const { governor, state } = fakeGovernor({ heapGrowthBudgetMb: 48 });
  state.heapUsedMb = 20 + 50;
  state.afterGcHeapMb = 24;
  const record = governor.maybeCollect();
  assert.equal(state.collected, 1);
  assert.equal(record.reason, "heap_growth");
  assert.equal(record.heapBeforeMb, 70);
  assert.equal(record.heapAfterMb, 24);
  assert.equal(governor.collections, 1);
});

test("collects on RSS growth alone: native memory V8 cannot see moves RSS but not the heap", () => {
  const { governor, state } = fakeGovernor({ rssGrowthBudgetMb: 96 });
  state.rssMb = 200 + 100; // heap untouched
  assert.equal(governor.maybeCollect().reason, "rss_growth");
});

test("the budget is measured from the last collection, not from the start", () => {
  const { governor, state } = fakeGovernor({ heapGrowthBudgetMb: 48, minIntervalMs: 0 });
  state.heapUsedMb = 80;
  state.afterGcHeapMb = 60; // a collection that can free little: the live set really is 60 MB now
  assert.ok(governor.maybeCollect());
  state.heapUsedMb = 60 + 40; // +40 over the NEW baseline: inside the budget
  assert.equal(governor.maybeCollect(), null);
  state.heapUsedMb = 60 + 48;
  assert.ok(governor.maybeCollect(), "+48 over the new baseline spends the budget again");
});

test("never collects more often than minIntervalMs, however much has grown", () => {
  const { governor, state } = fakeGovernor({ heapGrowthBudgetMb: 10, minIntervalMs: 1500 });
  state.heapUsedMb = 100;
  assert.ok(governor.maybeCollect());
  state.heapUsedMb = 200;
  state.nowMs += 1499;
  assert.equal(governor.maybeCollect(), null, "inside the interval");
  state.nowMs += 2;
  assert.ok(governor.maybeCollect(), "interval elapsed");
});

test("without a collector it is a harmless no-op", () => {
  const governor = createHeapGovernor({ gc: null, readMemory: () => ({ heapUsedMb: 1e6, rssMb: 1e6 }) });
  assert.equal(governor.enabled, false);
  assert.equal(governor.maybeCollect(), null);
});

test("a collector that throws is swallowed — the job must never fail because of its memory housekeeping", () => {
  const governor = createHeapGovernor({
    gc: () => {
      throw new Error("no gc here");
    },
    readMemory: () => ({ heapUsedMb: 1000, rssMb: 1000 }),
    minIntervalMs: 0,
  });
  assert.equal(governor.maybeCollect(), null);
});

test("resolveGc finds a real collector in this runtime, without needing --expose-gc", () => {
  // Node 20 (production) and the Node running this suite both allow switching the flag on at runtime.
  const gc = resolveGc();
  assert.equal(typeof gc, "function");
  assert.doesNotThrow(() => gc());
});

test("the default governor really collects: a heap full of dead objects shrinks", () => {
  const governor = createHeapGovernor({ heapGrowthBudgetMb: 8, rssGrowthBudgetMb: 1e9, minIntervalMs: 0 });
  assert.equal(governor.enabled, true);
  // ~30 MB of garbage promoted by being kept alive across a few collections, then dropped
  let hoard = Array.from({ length: 300_000 }, (_, i) => ({ i, text: `entry-${i}`.padEnd(40, "x") }));
  const during = process.memoryUsage().heapUsed;
  hoard = null;
  const record = governor.maybeCollect();
  assert.ok(record, "the growth should have spent an 8 MB budget");
  assert.ok(record.heapAfterMb * 1048576 < during, `heap went ${record.heapBeforeMb} -> ${record.heapAfterMb} MB`);
  assert.ok(record.pauseMs >= 0);
});
