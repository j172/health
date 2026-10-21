// Source-text checks for accessible_transit_sync_state (issue #704): its shape and registration.
// issue #730 removed the daily per-system sync that wrote this table; the table itself is kept (it is
// not part of the DROP list the owner approved), so its conventions are still pinned here.
// Same approach as lib/server/garbageRoutes/dbConventions.test.mjs.
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
