import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Issue #434 follow-up: the first live sync fired 40+ TDX requests in
// 3-system parallel batches (TDX basic tier = 5 req/min per credential) and
// every system after TRA/THSR got HTTP 429. These tests pin the fix: every
// TDX call routes through the shared limiter + 429 retry, systems are walked
// sequentially, and a missing token is a loud error instead of "0 rows, ok".
//
// issue #730：每日軌道無障礙同步（runTransitAccessibilitySync／railSyncCore）已移除，
// 只剩每小時電梯停用公告（runTransitFacilityAlertsSync）。

const REPO_ROOT = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, REPO_ROOT), "utf8");

test("Senior/Rail client uses the rate-limited retrying GET, not raw httpGetJson", () => {
  for (const f of ["lib/server/transit/tdxSeniorClient.ts"]) {
    const src = read(f);
    assert.match(src, /tdxGetJsonWithRetry/, f);
    assert.doesNotMatch(src, /httpGetJson/, f);
  }
});

test("Senior/Rail client throws on a missing token rather than silently returning []", () => {
  const src = read("lib/server/transit/tdxSeniorClient.ts");
  assert.doesNotMatch(src, /if \(!token\) return \[\]/);
  assert.match(src, /if \(!token\) throw/);
});

test("runSync walks RailSystems sequentially (no Promise.all batches) and fails loudly without a token", () => {
  const body = read("lib/server/transit/runSync.ts");
  assert.doesNotMatch(body, /Promise\.all/);
  assert.doesNotMatch(body, /batchSize/);
  assert.equal((body.match(/for \(const system of RAIL_SYSTEMS\)/g) || []).length, 1);
  assert.equal((body.match(/await getTdxToken\(\)/g) || []).length, 1);
});

test("admin route only triggers the hourly elevator-outage alerts job (no ?job= switch any more)", () => {
  const src = read("app/api/admin/transit-accessibility-sync/route.ts");
  assert.match(src, /runTransitFacilityAlertsSync\(/);
  assert.doesNotMatch(src, /searchParams\.get\("job"\)/);
});
