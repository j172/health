// Source-text checks for the DB-adjacent conventions of the per-system TDX Senior/Rail sync
// (issue #704) that repo convention says not to exercise against a live MySQL: the new state
// table's shape, its registration, and the "never an unscoped delete" rule. Same approach as
// lib/server/garbageRoutes/dbConventions.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (relativePath) => readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf-8");

test("accessible_transit_sync_state: keyed by rail_system alone — no UNIQUE KEY, and no time column in any key", () => {
  const schema = read("../db/schema.ts");
  const match = schema.match(/accessibleTransitSyncState:\s*`([\s\S]*?)`,/);
  assert.ok(match, "accessibleTransitSyncState DDL entry not found in schema.ts");
  const ddl = match[1];

  assert.match(ddl, /rail_system VARCHAR\(16\) NOT NULL PRIMARY KEY/);
  assert.ok(!/UNIQUE KEY/i.test(ddl), "the primary key is the only key");
  assert.ok(!/\bINDEX\b|\bKEY\b\s+\w+\s*\(/i.test(ddl.replace(/PRIMARY KEY/gi, "")), "no secondary key that could pick up a time column");
  // The time columns are plain columns (the cwa_station_weather bug class: a timestamp inside a
  // "latest state" table's key makes every sync INSERT instead of UPDATE).
  assert.match(ddl, /last_success_at DATETIME NULL/);
  assert.match(ddl, /last_attempt_at DATETIME NULL/);
});

test("accessible_transit_sync_state is registered in runSchemaMigrations (the table gets created)", () => {
  assert.match(read("../db/mysql.ts"), /TABLE_DDL\.accessibleTransitSyncState/);
});

test("the store only ever deletes one system's rows, and never truncates", () => {
  const store = read("./railSyncStore.ts");
  assert.ok(!/TRUNCATE/i.test(store));
  // The only DELETE is the shared, parameterised "this system" one inside replaceSystemRows().
  const deletes = store.match(/DELETE FROM[^`]*`/g) ?? [];
  assert.equal(deletes.length, 1);
  assert.match(deletes[0], /DELETE FROM \$\{table\} WHERE rail_system = \?`/);
  // ...and it runs inside the transaction that also holds the re-insert.
  const body = store.slice(store.indexOf("const replaceSystemRows"));
  assert.ok(body.indexOf("beginTransaction") < body.indexOf("DELETE FROM"));
  assert.ok(body.indexOf("DELETE FROM") < body.indexOf("commit()"));
});

test("the daily sync writes per system through the snapshot-reconcile guard, under its own advisory lock", () => {
  const core = read("./railSyncCore.ts");
  assert.match(core, /decideSnapshotReconcile\(/);
  assert.match(core, /store\.replaceMaps\(/);
  assert.match(core, /store\.replaceTransfers\(/);

  const runSync = read("./runSync.ts");
  assert.match(runSync, /withAdvisoryLock\(ACCESSIBILITY_SYNC_LOCK/);
  assert.match(runSync, /transit_accessibility_sync_lock/);
  assert.match(runSync, /runRailSystemsSync\(/);
  // The old "collect every system, write once at the end" arrays must not come back.
  assert.ok(!/allMaps|allTransfers|allStations/.test(runSync));
});
