// What an RSS ingestion run does between two units of work (runMonitor.ts), and how it behaves when the advisory
// lock that keeps a second ingestion out disappears underneath it.
import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";
import { createDbState } from "./testSupport/dbStub.mjs";

globalThis.__rssIngestTest = { db: createDbState() };
registerRepoHooks({ "@/lib/server/db/mysql": new URL("./testSupport/dbStub.mjs", import.meta.url).href });
const { createRunMonitor, AdvisoryLockLostError, RSS_INGESTION_STAGE_EVENT } = await import("./runMonitor.ts");

const governorThatCollects = (calls, record = null) => ({
  enabled: true,
  collections: 0,
  maybeCollect: () => {
    calls.push("collect");
    return record;
  },
});

test("a checkpoint heartbeats, then collects, then logs ONE line, then yields — in that order", async () => {
  const calls = [];
  const monitor = createRunMonitor({
    runId: 1,
    trigger: "internal-cron",
    startedAtMs: 0,
    heartbeat: async () => void calls.push("heartbeat"),
    governor: governorThatCollects(calls),
    logger: (stage, detail) => void calls.push(`log:${stage}:${detail.feed}`),
    yieldFn: async () => void calls.push("yield"),
  });

  await monitor.checkpoint("feed_done", { feed: "cdc" });

  assert.deepEqual(calls, ["heartbeat", "collect", "log:feed_done:cdc", "yield"]);
});

test("when a collection happens it gets its own stage line with before/after memory, ahead of the unit's line", async () => {
  const lines = [];
  const monitor = createRunMonitor({
    runId: 1,
    trigger: "admin-manual",
    startedAtMs: 0,
    heartbeat: async () => undefined,
    governor: governorThatCollects([], {
      reason: "heap_growth",
      pauseMs: 12,
      heapBeforeMb: 150,
      heapAfterMb: 60,
      rssBeforeMb: 600,
      rssAfterMb: 520,
    }),
    logger: (stage, detail) => void lines.push([stage, detail]),
    yieldFn: async () => undefined,
  });

  await monitor.checkpoint("source_done", { source: "udn_health" });

  assert.deepEqual(lines.map(([stage]) => stage), ["gc_collected", "source_done"]);
  assert.deepEqual(lines[0][1], {
    reason: "heap_growth",
    pauseMs: 12,
    heapBeforeMB: 150,
    heapAfterMB: 60,
    rssBeforeMB: 600,
    rssAfterMB: 520,
  });
});

test("tick (between items) collects and yields but neither heartbeats nor logs", async () => {
  const calls = [];
  const monitor = createRunMonitor({
    runId: 1,
    trigger: "internal-cron",
    startedAtMs: 0,
    heartbeat: async () => void calls.push("heartbeat"),
    governor: governorThatCollects(calls),
    logger: () => void calls.push("log"),
    yieldFn: async () => void calls.push("yield"),
  });

  await monitor.tick();

  assert.deepEqual(calls, ["collect", "yield"]);
});

test("a lost lock stops the run at the next checkpoint, before anything is collected or logged", async () => {
  const calls = [];
  const monitor = createRunMonitor({
    runId: 1,
    trigger: "internal-cron",
    startedAtMs: 0,
    heartbeat: async () => {
      throw new AdvisoryLockLostError("rss_ingestion_lock");
    },
    governor: governorThatCollects(calls),
    logger: () => void calls.push("log"),
    yieldFn: async () => void calls.push("yield"),
  });

  await assert.rejects(monitor.checkpoint("feed_done", { feed: "16" }), AdvisoryLockLostError);
  assert.deepEqual(calls, []);
});

test("the real heartbeat asks the lock connection whether the lock is still its own, and marks the run alive", async () => {
  const state = globalThis.__rssIngestTest.db;
  const asked = [];
  const lockConn = {
    query: async (sql, values) => {
      asked.push([sql, values]);
      return [[{ held: 1 }], undefined];
    },
  };
  const monitor = createRunMonitor({
    runId: 5,
    trigger: "internal-cron",
    startedAtMs: 0,
    lockName: "rss_ingestion_lock",
    lockConn,
    governor: governorThatCollects([]),
    logger: () => null,
    yieldFn: async () => undefined,
  });

  await monitor.checkpoint("feed_done", {});

  assert.match(asked[0][0], /IS_USED_LOCK\(\?\) = CONNECTION_ID\(\)/);
  assert.deepEqual(asked[0][1], ["rss_ingestion_lock"]);
  assert.ok(state.queries > 0, "the run row was touched (updated_at moved) through the database");
});

test("the real heartbeat treats NULL (nobody holds it), another connection, and a dead connection all as 'lost'", async () => {
  for (const answer of [
    async () => [[{ held: null }], undefined],
    async () => [[{ held: 0 }], undefined],
    async () => [[], undefined],
    async () => {
      throw new Error("PROTOCOL_CONNECTION_LOST");
    },
  ]) {
    const monitor = createRunMonitor({
      runId: 5,
      trigger: "internal-cron",
      startedAtMs: 0,
      lockName: "rss_ingestion_lock",
      lockConn: { query: answer },
      governor: governorThatCollects([]),
      logger: () => null,
      yieldFn: async () => undefined,
    });
    await assert.rejects(monitor.checkpoint("feed_done", {}), AdvisoryLockLostError);
  }
});

test("the default logger writes the rss_ingestion_stage event with the run's id and trigger", async (t) => {
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(String(line)));
  const monitor = createRunMonitor({
    runId: 42,
    trigger: "admin-manual",
    startedAtMs: Date.now(),
    heartbeat: async () => undefined,
    governor: governorThatCollects([]),
    yieldFn: async () => undefined,
  });

  monitor.log("run_start", { feeds: 52 });

  const entry = JSON.parse(lines[0]);
  assert.equal(entry.event, RSS_INGESTION_STAGE_EVENT);
  assert.equal(entry.event, "rss_ingestion_stage");
  assert.equal(entry.runId, 42);
  assert.equal(entry.trigger, "admin-manual");
  assert.equal(entry.stage, "run_start");
  assert.equal(entry.feeds, 52);
  assert.equal(typeof entry.rssMB, "number");
});
