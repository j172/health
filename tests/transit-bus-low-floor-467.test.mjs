import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Static source-content checks for the "server-only"-importing files in this
// feature (issue #467). Real behavioral coverage of the IsLowFloor -> ratio /
// trip-shape mapping and the fallback-partitioning logic lives in
// lib/server/transit/busLowFloorMath.test.mjs, which dynamically imports and
// executes that pure, server-only-free module directly — this file mirrors
// the established convention in tests/ncdr-and-tdx.test.mjs for everything
// that *does* carry "server-only" (TDX clients, sync jobs, cron
// registration), none of which this repo's node --test setup executes
// directly.

const read = (relPath) => fs.readFileSync(path.join(process.cwd(), relPath), "utf-8");

test("tdxBusClient.ts: covers all 22 counties and hits the v3 Bus Vehicle+Schedule endpoints", () => {
  const content = read("lib/server/transit/tdxBusClient.ts");

  assert.ok(content.includes('import "server-only"'));
  assert.ok(content.includes("getTdxToken"), "should reuse the shared TDX OAuth helper (issue #434)");
  assert.ok(
    content.includes("/api/basic/v3/Bus/Vehicle/City/"),
    "should call TDX's Basic Bus Vehicle endpoint",
  );
  assert.ok(
    content.includes("/api/basic/v3/Bus/Schedule/City/"),
    "should call TDX's Basic Bus Schedule endpoint",
  );
  assert.ok(content.includes("IsLowFloor"), "should read IsLowFloor off the TDX response shapes");

  // Count TDX_BUS_CITIES entries the same way the Bus TDX client's county map is counted;
  // pin the total at exactly 22 counties.
  const entryMatches = content.match(/^\s*[A-Z]{2,5}:\s*{\s*tdxName:/gm) || [];
  assert.strictEqual(entryMatches.length, 22, `Expected TDX_BUS_CITIES to have exactly 22 entries, found ${entryMatches.length}`);

  assert.ok(
    content.includes("Promise.allSettled"),
    "per-county TDX failures must be isolated (mirrors the other TDX clients), not Promise.all",
  );
});

test("tdxBusClient.ts: delegates the IsLowFloor -> ratio/trip mapping to the tested pure module, not an inline reimplementation", () => {
  const content = read("lib/server/transit/tdxBusClient.ts");
  assert.ok(content.includes("buildRoutesFromTdxBusData"));
  assert.ok(content.includes('from "./busLowFloorMath"'));
});

test("runSync.ts: exports runTransitBusSync and only ever writes a county it actually fetched routes for", () => {
  const content = read("lib/server/transit/runSync.ts");

  assert.ok(content.includes("export async function runTransitBusSync"));
  assert.ok(content.includes("partitionSyncableCounties"), "must use the fallback-preserving partition helper");
  assert.ok(content.includes("fetchAllTdxBusRoutes"));

  // The DELETE+INSERT must be wrapped in a transaction so a mid-write
  // failure can't leave a county's rows deleted-but-not-reinserted.
  assert.ok(content.includes("beginTransaction"));
  assert.ok(content.includes("DELETE FROM accessible_transit_routes WHERE county = ?"));
  assert.ok(content.includes("rollback"));

  // Whole-batch failure must return early without ever reaching a DB write,
  // so existing seed/previous-sync rows are left untouched.
  assert.match(
    content,
    /catch \(err\) \{[\s\S]{0,400}existing seed\/previous data left untouched[\s\S]{0,100}return summary;/,
    "a whole-batch TDX failure must bail out before any DB write, preserving existing rows",
  );
});

test("runSync.ts: TransitBusSyncSummary distinguishes skipped (fallback) counties from synced ones", () => {
  const content = read("lib/server/transit/runSync.ts");
  assert.ok(content.includes("skippedCounties: string[]"));
  assert.ok(content.includes("summary.skippedCounties = skippedCounties"));
});

test("registerJobs.ts: runTransitBusSync is imported and scheduled at 30 3 * * *, not colliding with the other 3am transit/senior jobs", () => {
  const content = read("lib/server/cron/registerJobs.ts");
  assert.ok(content.includes("runTransitBusSync"));

  const scheduleCalls = [...content.matchAll(/cron\.schedule\(\s*"([^"]+)"/g)].map((m) => m[1]);
  assert.ok(scheduleCalls.includes("30 3 * * *"), "transit-bus-sync should be scheduled at 30 3 * * *");

  // Only check the new job's own 3am slot against its documented neighbors
  // (transit-accessibility 15, senior-tourism 20, senior-card 25, public-art
  // 0) — a full file-wide collision audit is out of scope for this ticket and
  // would also flag a pre-existing, unrelated collision already on main
  // (green-products-cron and wra-catalog-sync-cron both at "30 4 * * *").
  const threeAmCalls = scheduleCalls.filter((expr) => expr.endsWith(" 3 * * *"));
  const minutesAt3am = threeAmCalls.flatMap((expr) => expr.split(" ")[0].split(","));
  const counts = new Map();
  for (const m of minutesAt3am) counts.set(m, (counts.get(m) || 0) + 1);
  assert.equal(counts.get("30"), 1, "the new 30 3 * * * job must not collide with another job at the same minute");
});

test("admin transit-bus-sync route exists, requires the admin secret, and calls runTransitBusSync", () => {
  const routeFile = path.join(process.cwd(), "app", "api", "admin", "transit-bus-sync", "route.ts");
  assert.ok(fs.existsSync(routeFile), "app/api/admin/transit-bus-sync/route.ts should exist");
  const content = fs.readFileSync(routeFile, "utf-8");
  assert.ok(content.includes("requireAdminSecret"));
  assert.ok(content.includes("runTransitBusSync"));
});

test("mysql.ts migrates accessible_transit_routes with source/sample_trips_json columns", () => {
  const content = read("lib/server/db/mysql.ts");
  assert.ok(
    content.includes("ALTER TABLE accessible_transit_routes") &&
      content.includes("ADD COLUMN IF NOT EXISTS source VARCHAR(16) NOT NULL DEFAULT 'seed'") &&
      content.includes("ADD COLUMN IF NOT EXISTS sample_trips_json JSON NULL"),
    "mysql.ts should migrate accessible_transit_routes with source + sample_trips_json columns",
  );
});

test("queries.ts: getTransitAccessibilityOverview maps the new source/sampleTrips columns back into AccessibleTransitRoute", () => {
  const content = read("lib/server/transit/queries.ts");
  assert.ok(content.includes("parseSampleTrips"));
  assert.ok(content.includes("sampleTrips: parseSampleTrips(r.sample_trips_json)"));
  assert.ok(content.includes('source: (r.source as "seed" | "tdx_bus") || "seed"'));
});

test("ensureTransitSeeded is untouched — the existing seed-if-empty fallback still backstops a brand new table", () => {
  const content = read("lib/server/transit/queries.ts");
  assert.match(
    content,
    /SELECT COUNT\(\*\) as cnt FROM accessible_transit_routes[\s\S]{0,200}if \(\(routeCount\[0\]\?\.cnt \|\| 0\) === 0\)/,
    "ensureTransitSeeded must still only seed when the table is completely empty",
  );
});

test("AccessibleTransitContent.tsx shows a per-trip low-floor badge and a real-data vs seed-data indicator", () => {
  const content = read("components/Tools/AccessibleTransitContent.tsx");
  assert.ok(content.includes("r.sampleTrips"), "should render the per-route sample trips");
  assert.ok(content.includes("trip.isLowFloor"), "should branch styling/label on each trip's isLowFloor flag");
  assert.ok(content.includes('r.source === "tdx_bus"'), "should visually distinguish real TDX rows from seed rows");
});
