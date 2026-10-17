// ingest_runs bookkeeping added for issue #699: quiet 'skipped' rows, a run that proves it is alive, an orphan rule
// that measures silence instead of age, and a run list that can be paged and filtered.
import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks, stubModule } from "../garbageRoutes/testSupport/repoHooks.mjs";

const calls = [];
globalThis.__ingestionLoggerTest = {
  conn: {
    execute: async (sql, values) => {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      return [{ insertId: 77, affectedRows: 1 }, undefined];
    },
    query: async (sql, values) => {
      calls.push({ sql: sql.replace(/\s+/g, " ").trim(), values });
      return [[{ id: 1 }], undefined];
    },
  },
};
registerRepoHooks({
  "@/lib/server/db/mysql": stubModule(`
    export const withConnection = async (fn) => fn(globalThis.__ingestionLoggerTest.conn);
    export const toSqlDateTime = (d) => d.toISOString().slice(0, 19).replace("T", " ");
    export const utcNowSql = () => "2026-10-16 12:00:00";
  `),
});
const logger = await import("./ingestionLogger.ts");

test("an orphaned run is one that has gone SILENT for 20 minutes, not one that started 20 minutes ago", async () => {
  calls.length = 0;
  const id = await logger.createIngestionRun("internal-cron");
  assert.equal(id, 77);
  const reap = calls.find((c) => c.sql.startsWith("UPDATE ingest_runs SET status = 'failed'"));
  assert.ok(reap, "creating a run still reaps abandoned ones");
  assert.match(reap.sql, /COALESCE\(updated_at, started_at\) < DATE_SUB\(UTC_TIMESTAMP\(\), INTERVAL \? MINUTE\)/);
  assert.deepEqual(reap.values, [77, 20], "the window is still 20 minutes — it is not widened");
  assert.doesNotMatch(reap.sql, /started_at</, "age alone must not decide it");
});

test("touchIngestionRun moves updated_at forward, and only for a run that is still 'running'", async () => {
  calls.length = 0;
  await logger.touchIngestionRun(12);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /^UPDATE ingest_runs SET updated_at = \? WHERE id = \? AND status = 'running'$/);
  assert.deepEqual(calls[0].values, ["2026-10-16 12:00:00", 12]);
});

test("a skipped attempt is stored as its own status with an end time and no error message", async () => {
  calls.length = 0;
  const id = await logger.recordSkippedIngestionRun({
    triggerType: "admin-manual",
    reason: "lock_held",
    startedAt: new Date(Date.now() - 250),
  });
  assert.equal(id, 77);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /INSERT INTO ingest_runs \(trigger_type, status, started_at, ended_at, duration_ms, summary_json, created_at, updated_at\) VALUES \(\?, 'skipped', \?, \?, \?, \?, \?, \?\)/);
  const [trigger, , endedAt, duration, summary] = calls[0].values;
  assert.equal(trigger, "admin-manual");
  assert.equal(endedAt, "2026-10-16 12:00:00");
  assert.ok(duration >= 200 && duration < 5000, `duration ${duration}`);
  assert.deepEqual(JSON.parse(summary), { skipped: "lock_held" });
  assert.doesNotMatch(calls[0].sql, /error_message/, "a skip is not an error");
});

test("getRecentRuns keeps its old behaviour by default: newest 20, no filter", async () => {
  calls.length = 0;
  await logger.getRecentRuns();
  assert.doesNotMatch(calls[0].sql, /WHERE/);
  assert.match(calls[0].sql, /ORDER BY id DESC LIMIT \? OFFSET \?$/);
  assert.deepEqual(calls[0].values, [20, 0]);
});

test("getRecentRuns can page back and filter by status and trigger, with every value bound as a parameter", async () => {
  calls.length = 0;
  await logger.getRecentRuns(50, { offset: 100, status: "skipped", triggerType: "internal-cron" });
  assert.match(calls[0].sql, /WHERE status = \? AND trigger_type = \? ORDER BY id DESC LIMIT \? OFFSET \?$/);
  assert.deepEqual(calls[0].values, ["skipped", "internal-cron", 50, 100]);

  calls.length = 0;
  await logger.getRecentRuns(20, { triggerType: "admin-manual" });
  assert.match(calls[0].sql, /WHERE trigger_type = \? ORDER BY/);
  assert.deepEqual(calls[0].values, ["admin-manual", 20, 0]);

  calls.length = 0;
  await logger.getRecentRuns(20, { offset: -5 });
  assert.deepEqual(calls[0].values, [20, 0], "a negative offset is clamped, not passed to MySQL");
});
