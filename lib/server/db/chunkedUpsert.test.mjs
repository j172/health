// Unit tests for lib/server/db/chunkedUpsert.ts — run with `npm test`.
//
// chunkedUpsert has ~30 callers, almost all on the default 500-row statements with
// no hand-backs; issue #674 added opt-in options (batchSize / yieldBetweenBatches /
// onBatch) for the garbage-route sync. These pin that the defaults did not change
// and that the options do what the sync relies on. The MySQL pool is stubbed with a
// data: URL module that talks to globalThis.__chunkedUpsertTest.
import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

const MYSQL_STUB = `data:text/javascript,${encodeURIComponent(`
export const utcNowSql = () => "2026-10-16 00:00:00";
export const withConnection = async (fn) => fn(globalThis.__chunkedUpsertTest.conn);
`)}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") return { url: "data:text/javascript,", shortCircuit: true };
    if (specifier === "@/lib/server/db/mysql") return { url: MYSQL_STUB, shortCircuit: true };
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

const { chunkedUpsert } = await import("./chunkedUpsert.ts");

/** A fake connection: records each statement's row count; `updatedPerBatch` of its rows count as updates (affectedRows 2 each). */
const installConnection = ({ updatedPerBatch = 0 } = {}) => {
  const batches = [];
  globalThis.__chunkedUpsertTest = {
    conn: {
      async query(sql, params) {
        const rows = params[0];
        batches.push({ sql, rows: rows.length, firstRow: rows[0] });
        return [{ affectedRows: rows.length - updatedPerBatch + updatedPerBatch * 2 }, undefined];
      },
    },
  };
  return batches;
};

const records = (count) => Array.from({ length: count }, (_, i) => ({ id: i }));
const toRow = (record, now) => [record.id, now];
const SQL = "INSERT INTO t (id, at) VALUES ? ON DUPLICATE KEY UPDATE at = VALUES(at)";

test("defaults are unchanged: 500-row statements, no hand-back to the event loop between them", async () => {
  const batches = installConnection();

  let ticks = 0;
  let running = true;
  const tick = () => {
    ticks++;
    if (running) setImmediate(tick);
  };
  setImmediate(tick);

  const result = await chunkedUpsert(records(1200), SQL, toRow);
  running = false;

  assert.deepEqual(batches.map((b) => b.rows), [500, 500, 200]);
  assert.deepEqual(result, { inserted: 1200, updated: 0 });
  assert.equal(batches[0].sql, SQL);
  assert.deepEqual(batches[0].firstRow, [0, "2026-10-16 00:00:00"]);
  // Every await in the loop resolves from the microtask queue, so with no yield the
  // whole upsert finishes before the check phase (and our counter) ever runs.
  assert.equal(ticks, 0);
});

test("inserted/updated come from affectedRows (1 per insert, 2 per update), batch by batch", async () => {
  installConnection({ updatedPerBatch: 100 });
  const result = await chunkedUpsert(records(1000), SQL, toRow);
  // 2 batches of 500, each with 100 updates and 400 inserts.
  assert.deepEqual(result, { inserted: 800, updated: 200 });
});

test("batchSize, onBatch progress and yieldBetweenBatches work together (what the garbage-route sync passes)", async () => {
  const batches = installConnection();
  const progress = [];

  let ticks = 0;
  let running = true;
  const tick = () => {
    ticks++;
    if (running) setImmediate(tick);
  };
  setImmediate(tick);

  const result = await chunkedUpsert(records(1050), SQL, toRow, {
    batchSize: 200,
    yieldBetweenBatches: true,
    onBatch: (p) => progress.push(p),
  });
  running = false;

  assert.deepEqual(batches.map((b) => b.rows), [200, 200, 200, 200, 200, 50]);
  assert.deepEqual(result, { inserted: 1050, updated: 0 });
  assert.deepEqual(progress.map((p) => p.batch), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(progress.map((p) => p.rowsDone), [200, 400, 600, 800, 1000, 1050]);
  assert.ok(progress.every((p) => p.rowsTotal === 1050));
  // One macrotask turn per batch: the counter ran in between.
  assert.ok(ticks >= 5, `expected the event loop to turn between batches, ticks=${ticks}`);
});

test("an empty list runs no statement", async () => {
  const batches = installConnection();
  assert.deepEqual(await chunkedUpsert([], SQL, toRow, { batchSize: 10 }), { inserted: 0, updated: 0 });
  assert.equal(batches.length, 0);
});
