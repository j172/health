// Issue #674 production bug: the first garbage-route sync wrote 臺北 fine and then
// the web process (pm2 health-web, 768 MB heap cap, ~450 MB already resident,
// shared with every cron and the site's traffic) restarted on every attempt at
// 新北 — a 3.6 MB / 26,574-stop CSV. Not reproduced on a dev machine (it fits in
// RAM there); what was measured, and what these tests lock in, is that the old
// pipeline needed ~+140 MB of peak RSS, a >= 72 MB V8 old space, and one ~170 ms
// unbroken synchronous stretch for that file, while the fixed one needs ~+40 MB,
// ~20 MB, and slices of a few ms. See the PR for the numbers.
//
// Three parts: the stage log, the sync's wiring (stubbed outside edges, small
// fixtures, in-process), and the live-sized run in a child process under a tight
// `--max-old-space-size` (the old pipeline dies with "JavaScript heap out of memory").
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerSyncStubs, resetSyncStubs } from "./testSupport/syncStubs.mjs";
import { buildSyntheticNtpcCsv, SYNTHETIC_NTPC_ROWS } from "./testSupport/syntheticNtpcCsv.mjs";

const fixturePath = (name) => fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url));
const NTPC_SAMPLE = fixturePath("ntpc-125664-sample.csv");
const TAIPEI_SAMPLE = fixturePath("taipei-136515-sample.csv");

const state = registerSyncStubs({ ntpcCsvPath: NTPC_SAMPLE, taipeiCsvPath: TAIPEI_SAMPLE });
const { createStageLogger, UPSERT_LOG_EVERY_BATCHES } = await import("./stageLog.ts");
const { runGarbageRoutesSync } = await import("./runSync.ts");
const { GARBAGE_ROUTE_UPSERT_BATCH_SIZE } = await import("./queries.ts");

const STAGE_EVENT = "garbage_routes_sync_stage";

// ---- the stage log ---------------------------------------------------------

test("createStageLogger: one self-contained JSON line per stage, with heap, RSS, elapsed time and the extra detail", () => {
  const lines = [];
  const log = createStageLogger({
    runId: 7,
    city: "new_taipei",
    runStartedAtMs: 1000,
    now: () => 1750,
    readMemory: () => ({ heapUsedMB: 41.2, rssMB: 468.9, externalMB: 9.7 }),
    write: (line) => lines.push(line),
  });

  log("after_parse", { rows: 26574 });

  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes("\n"), "must be a single line");
  assert.deepEqual(JSON.parse(lines[0]), {
    event: STAGE_EVENT,
    runId: 7,
    city: "new_taipei",
    stage: "after_parse",
    heapUsedMB: 41.2,
    rssMB: 468.9,
    externalMB: 9.7,
    elapsedMs: 750,
    rows: 26574,
  });
});

test("createStageLogger: the default reader reports the real process memory in MB", () => {
  const lines = [];
  createStageLogger({ runId: 1, city: "taipei", runStartedAtMs: Date.now(), write: (l) => lines.push(l) })("before_fetch");
  const entry = JSON.parse(lines[0]);
  assert.ok(entry.heapUsedMB > 1 && entry.heapUsedMB < 100_000, `heapUsedMB=${entry.heapUsedMB}`);
  assert.ok(entry.rssMB >= entry.heapUsedMB, `rssMB=${entry.rssMB}`);
  assert.ok(entry.externalMB >= 0);
  assert.ok(entry.elapsedMs >= 0);
});

test("createStageLogger: a failing sink or memory read never throws into the sync", () => {
  const log = createStageLogger({
    runId: 1,
    city: "taipei",
    runStartedAtMs: 0,
    write: () => {
      throw new Error("disk full");
    },
  });
  assert.doesNotThrow(() => log("before_fetch"));

  const logWithBadRead = createStageLogger({
    runId: 1,
    city: "taipei",
    runStartedAtMs: 0,
    readMemory: () => {
      throw new Error("no /proc");
    },
    write: () => assert.fail("nothing should be written when the read fails"),
  });
  assert.doesNotThrow(() => logWithBadRead("before_fetch"));
});

// ---- the sync's wiring (small fixtures, in-process) -------------------------

/** Runs the sync with console.log captured; returns the result and the parsed stage lines. */
const runCaptured = async (t) => {
  const lines = [];
  t.mock.method(console, "log", (line) => lines.push(String(line)));
  const result = await runGarbageRoutesSync();
  const stages = lines.map((line) => JSON.parse(line)).filter((entry) => entry.event === STAGE_EVENT);
  return { result, stages };
};

const stagesOf = (stages, city) => stages.filter((entry) => entry.city === city).map((entry) => entry.stage);

test("runGarbageRoutesSync logs before_fetch, after_fetch, after_parse, after_upsert and after_prune for each city, with memory on every line", async (t) => {
  resetSyncStubs(state);
  const { result, stages } = await runCaptured(t);

  assert.deepEqual(result.cities.map((c) => [c.city, c.error]), [["taipei", null], ["new_taipei", null]]);
  for (const city of ["taipei", "new_taipei"]) {
    assert.deepEqual(stagesOf(stages, city), ["before_fetch", "after_fetch", "after_parse", "after_upsert", "after_prune"], city);
  }
  for (const entry of stages) {
    assert.equal(typeof entry.heapUsedMB, "number");
    assert.equal(typeof entry.rssMB, "number");
    assert.equal(typeof entry.runId, "number");
    assert.ok(entry.rssMB > 0);
  }
  // elapsedMs never goes backwards, and Taipei is fully logged before 新北 starts.
  const elapsed = stages.map((entry) => entry.elapsedMs);
  assert.deepEqual(elapsed, [...elapsed].sort((a, b) => a - b));
  assert.equal(stages.findIndex((e) => e.city === "new_taipei"), stagesOf(stages, "taipei").length);

  const ntpcParse = stages.find((e) => e.city === "new_taipei" && e.stage === "after_parse");
  assert.equal(ntpcParse.rows, result.cities[1].fetched);
  assert.ok(stages.find((e) => e.city === "new_taipei" && e.stage === "after_fetch").chars > 0);
});

test("runGarbageRoutesSync: a failing Taipei download is recorded and 新北 is still synced (per-city isolation)", async (t) => {
  resetSyncStubs(state);
  state.httpStatus.taipei = 503;
  const { result, stages } = await runCaptured(t);

  const [taipei, newTaipei] = result.cities;
  assert.match(taipei.error, /503/);
  assert.equal(taipei.fetched, 0);
  assert.equal(newTaipei.error, null);
  assert.ok(newTaipei.fetched > 0);
  assert.equal(newTaipei.inserted, newTaipei.fetched);
  assert.deepEqual(stagesOf(stages, "taipei"), ["before_fetch", "city_failed"]);
  assert.equal(stages.find((e) => e.stage === "city_failed").error.includes("503"), true);
  assert.deepEqual(Object.keys(state.upsertRowsByCity), ["new_taipei"]);
  assert.equal(state.ingestErrors.length, 1, "the failure is written to ingest_errors");
});

test("runGarbageRoutesSync: a fetch under 50% of the previous snapshot keeps the stale rows (prune guard), a normal one prunes only its own city", async (t) => {
  resetSyncStubs(state);
  state.previousCount = 1000; // both fixtures are far below half of that
  let { result, stages } = await runCaptured(t);
  assert.equal(state.deletes.length, 0, "no DELETE may run on an anomalously small fetch");
  assert.ok(result.cities.every((c) => c.pruneSkippedReason !== null && c.pruned === 0));
  assert.equal(state.ingestErrors.length, 2);
  assert.ok(stages.filter((e) => e.stage === "after_prune").every((e) => e.pruneSkipped === true));

  t.mock.restoreAll();
  resetSyncStubs(state);
  state.previousCount = 10; // the fixtures are comfortably above half of this
  ({ result, stages } = await runCaptured(t));
  assert.equal(state.deletes.length, 2);
  assert.deepEqual(state.deletes.map(([city]) => city).sort(), ["new_taipei", "taipei"]);
  assert.ok(result.cities.every((c) => c.pruneSkippedReason === null && c.error === null));
});

test("runGarbageRoutesSync: a city whose rows no longer parse is isolated too (HTML maintenance page from 新北)", async (t) => {
  resetSyncStubs(state);
  const dir = mkdtempSync(join(tmpdir(), "garbage-sync-html-"));
  const savedFile = state.files.ntpc;
  try {
    const htmlPath = join(dir, "maintenance.html");
    writeFileSync(htmlPath, "<html><body>Request Rejected</body></html>");
    state.files.ntpc = htmlPath;
    const { result } = await runCaptured(t);
    assert.equal(result.cities[0].error, null);
    assert.match(result.cities[1].error, /125664/);
    assert.deepEqual(Object.keys(state.upsertRowsByCity), ["taipei"]);
  } finally {
    state.files.ntpc = savedFile;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the live-sized run, under a tight heap ---------------------------------

const CHILD = fileURLToPath(new URL("./testSupport/syncChild.mjs", import.meta.url));
/**
 * V8 old-space cap for the child. Measured on the synthetic file below: the fixed
 * pipeline completes down to ~20 MB, the previous one (500-row statements, rows
 * materialised through parseCsv) aborts with "JavaScript heap out of memory" at
 * 64 MB and below. 40 MB leaves 2x headroom on one side and a clear gap on the other.
 */
const CHILD_OLD_SPACE_MB = 40;

const runChild = (csvPath, extraEnv = {}) => {
  const run = spawnSync(
    process.execPath,
    ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", `--max-old-space-size=${CHILD_OLD_SPACE_MB}`, CHILD, csvPath, TAIPEI_SAMPLE],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...extraEnv } },
  );
  const resultLine = run.stdout.split("\n").find((line) => line.startsWith("RESULT:"));
  assert.ok(
    run.status === 0 && resultLine,
    `child exited ${run.status} (signal ${run.signal}) under --max-old-space-size=${CHILD_OLD_SPACE_MB}:\n${run.stderr.slice(-1500)}`,
  );
  return JSON.parse(resultLine.slice("RESULT:".length));
};

test(`a live-sized 新北 sync (26,574 stops, 3.9 MB) completes inside a ${CHILD_OLD_SPACE_MB} MB V8 heap, in bounded statements, handing the event loop back throughout`, { timeout: 120_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "garbage-sync-"));
  try {
    const csvPath = join(dir, "ntpc-synthetic.csv");
    writeFileSync(csvPath, buildSyntheticNtpcCsv());

    const out = runChild(csvPath);
    const [taipei, newTaipei] = out.cities;

    // both cities fully written, nothing failed or skipped
    assert.equal(taipei.error, null);
    assert.equal(newTaipei.error, null);
    assert.equal(newTaipei.fetched, SYNTHETIC_NTPC_ROWS);
    assert.equal(newTaipei.inserted, SYNTHETIC_NTPC_ROWS);
    assert.equal(out.upsertRowsByCity.new_taipei, SYNTHETIC_NTPC_ROWS);
    assert.equal(out.skipped, null);

    // bounded statements: never more than 200 rows, so each formatted INSERT stays small
    const ntpcBatches = Math.ceil(SYNTHETIC_NTPC_ROWS / GARBAGE_ROUTE_UPSERT_BATCH_SIZE);
    const taipeiBatches = Math.ceil(taipei.fetched / GARBAGE_ROUTE_UPSERT_BATCH_SIZE);
    assert.equal(GARBAGE_ROUTE_UPSERT_BATCH_SIZE, 200);
    assert.equal(out.maxUpsertRows, GARBAGE_ROUTE_UPSERT_BATCH_SIZE);
    assert.equal(out.upsertQueries, ntpcBatches + taipeiBatches);
    assert.ok(out.maxSqlChars < 100_000, `largest formatted statement was ${out.maxSqlChars} characters`);

    // yields: one per ~500 parsed rows, one per upsert batch, one between the cities
    const expectedMinimumYields = Math.floor(SYNTHETIC_NTPC_ROWS / 500) + ntpcBatches;
    assert.ok(out.immediateCalls >= expectedMinimumYields, `only ${out.immediateCalls} event-loop hand-backs, expected >= ${expectedMinimumYields}`);

    // the stage log is a complete trail for 新北: every stage, 13 progress lines, memory on each
    const ntpcStages = out.stages.filter((entry) => entry.city === "new_taipei");
    const names = ntpcStages.map((entry) => entry.stage);
    assert.deepEqual(names.slice(0, 3), ["before_fetch", "after_fetch", "after_parse"]);
    assert.deepEqual(names.slice(-2), ["after_upsert", "after_prune"]);
    const progress = ntpcStages.filter((entry) => entry.stage === "after_upsert_batches");
    assert.equal(progress.length, Math.floor(ntpcBatches / UPSERT_LOG_EVERY_BATCHES));
    assert.deepEqual(progress.slice(0, 2).map((entry) => entry.rowsDone), [2000, 4000]);
    assert.ok(progress.every((entry) => entry.rowsTotal === SYNTHETIC_NTPC_ROWS && entry.heapUsedMB > 0 && entry.rssMB > 0));
    assert.equal(ntpcStages.find((entry) => entry.stage === "after_parse").rows, SYNTHETIC_NTPC_ROWS);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the same live-sized run honours the prune guard: a previous snapshot three times the size keeps the old rows and writes an ingest error", { timeout: 120_000 }, () => {
  const dir = mkdtempSync(join(tmpdir(), "garbage-sync-"));
  try {
    const csvPath = join(dir, "ntpc-synthetic.csv");
    writeFileSync(csvPath, buildSyntheticNtpcCsv());

    const out = runChild(csvPath, { GARBAGE_SYNC_TEST_PREVIOUS_COUNT: String(SYNTHETIC_NTPC_ROWS * 3) });
    const newTaipei = out.cities[1];
    assert.equal(newTaipei.fetched, SYNTHETIC_NTPC_ROWS);
    assert.equal(newTaipei.pruned, 0);
    assert.match(newTaipei.pruneSkippedReason, /under 50%/);
    assert.equal(out.deletes, 0);
    assert.equal(out.ingestErrors, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
