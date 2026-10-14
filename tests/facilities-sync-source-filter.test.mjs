import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// 2026-10-14: the two TDX sources added 2026-10-13 (tdx_aps #468,
// tdx_parking #469) had never run — facilities-sync only runs from the
// six-monthly sync — so /tools/audible-signals and /tools/accessible-parking
// had zero rows. The route now accepts a `sources` filter so a new source can
// be backfilled alone.

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("runFacilitySync can be limited to specific source keys, defaulting to all", () => {
  const src = read("lib/server/facilities/runSync.ts");
  assert.match(src, /export async function runFacilitySync\(only\?: readonly string\[\]\)/);
  assert.match(src, /only\?\.length \? SOURCES\.filter\(\(s\) => only\.includes\(s\.key\)\) : SOURCES/);
  assert.match(src, /key: "tdx_aps"/);
  assert.match(src, /key: "tdx_parking"/);
});

test("the facilities-sync route authenticates first and rejects unknown source keys", () => {
  const src = read("app/api/admin/facilities-sync/route.ts");
  assert.ok(src.indexOf("requireAdminSecret(request)") < src.indexOf("runFacilitySync(sources)"));
  assert.match(src, /FACILITY_SOURCE_KEYS\.includes\(s\)/);
  assert.match(src, /status: 400/);
});
