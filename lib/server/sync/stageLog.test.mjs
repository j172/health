import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const { createJsonStageLogger, readMemoryMb } = await import("./stageLog.ts");

test("one self-contained JSON line per stage: event, repeated fields, stage, memory, elapsed time and the extra detail", () => {
  const lines = [];
  const log = createJsonStageLogger({
    event: "rss_ingestion_stage",
    fields: { runId: 7, trigger: "internal-cron" },
    startedAtMs: 1000,
    now: () => 1750,
    readMemory: () => ({ heapUsedMB: 41.2, rssMB: 468.9, externalMB: 9.7 }),
    write: (line) => lines.push(line),
  });

  const memory = log("feed_done", { feed: "cdc", enriched: 3 });

  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes("\n"), "a single line");
  assert.deepEqual(JSON.parse(lines[0]), {
    event: "rss_ingestion_stage",
    runId: 7,
    trigger: "internal-cron",
    stage: "feed_done",
    heapUsedMB: 41.2,
    rssMB: 468.9,
    externalMB: 9.7,
    elapsedMs: 750,
    feed: "cdc",
    enriched: 3,
  });
  assert.equal(memory.rssMB, 468.9, "the snapshot is returned to the caller");
});

test("the default memory reader is PR #697's: the real process in MB", () => {
  const lines = [];
  createJsonStageLogger({ event: "e", fields: {}, startedAtMs: Date.now(), write: (l) => lines.push(l) })("s");
  const entry = JSON.parse(lines[0]);
  assert.ok(entry.heapUsedMB > 1);
  assert.ok(entry.rssMB >= entry.heapUsedMB);
  assert.ok(entry.externalMB >= 0);
  assert.deepEqual(Object.keys(readMemoryMb()).sort(), ["externalMB", "heapUsedMB", "rssMB"]);
});

test("a failing sink or memory read never throws into the job", () => {
  const brokenSink = createJsonStageLogger({
    event: "e",
    fields: {},
    startedAtMs: 0,
    write: () => {
      throw new Error("disk full");
    },
  });
  assert.doesNotThrow(() => brokenSink("s"));

  const brokenRead = createJsonStageLogger({
    event: "e",
    fields: {},
    startedAtMs: 0,
    readMemory: () => {
      throw new Error("no /proc");
    },
    write: () => assert.fail("nothing is written when the read fails"),
  });
  assert.equal(brokenRead("s"), null);
});
