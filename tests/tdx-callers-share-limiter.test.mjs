import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// TDX's basic tier allows 5 requests/minute for the WHOLE client credential
// (see lib/server/tdx/rateLimiter.ts). The facility sources (tdx_parking /
// tdx_aps) and — via PR #659 — the Senior/Rail sync queue through the shared
// process-wide limiter in tdxGetJsonWithRetry(). The other TDX callers
// (rail alerts, bus low-floor, Senior card) used raw
// httpGetJson(), so their bursts competed for the same quota and triggered
// HTTP 429s for every other job (all of them run in the same Node process via
// lib/server/cron/registerJobs.ts, so one shared limiter covers them all).
// These source-text tests pin that every TDX caller goes through the limiter,
// and add a discovery sweep so a future caller can't regress it.

const REPO_ROOT = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, REPO_ROOT), "utf8");

const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// file -> number of TDX GET call sites it must route through tdxGetJsonWithRetry.
const CONVERTED = {
  "lib/server/transit/tdxBusClient.ts": 2, // Bus/Vehicle + Bus/Schedule
  "lib/server/seniorCard/tdxClient.ts": 1, // fetchSeniorCard（issue #729 後只剩管理員手動觸發）
  "lib/server/transit/tdxSeniorClient.ts": 1, // fetchSeniorRail helper (converted by PR #659)
  "lib/server/transit/railStationCounty.ts": 1, // Rail/*/Station county lookup (converted by PR #659)
};

for (const [file, callSites] of Object.entries(CONVERTED)) {
  test(`${file} routes every TDX GET through tdxGetJsonWithRetry (shared limiter + 429 retry), not raw httpGetJson`, () => {
    const src = stripComments(read(file));
    assert.match(src, /import \{ tdxGetJsonWithRetry \} from "@\/lib\/server\/tdx\/getJsonWithRetry";/);
    assert.doesNotMatch(src, /httpGetJson|httpRequest|\bfetch\(/, `${file} must not issue raw HTTP calls to TDX`);
    assert.equal((src.match(/tdxGetJsonWithRetry</g) || []).length, callSites, `${file}: call-site count`);
    // Behaviour-preserving conversion: each call keeps its original 12s timeout.
    assert.equal((src.match(/timeoutMs: 12000/g) || []).length, callSites, `${file}: each call keeps timeoutMs: 12000`);
  });
}

// Not TDX callers: the token endpoint (OAuth, not part of the API quota) and
// the limiter wrapper itself, which is the one place allowed to call httpRequest.
const EXEMPT = new Set(["lib/server/tdx/auth.ts", "lib/server/tdx/getJsonWithRetry.ts"]);

function listSourceFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

test("sweep: no lib/ or app/ file that calls TDX (getTdxToken / tdx.transportdata.tw/api) uses raw httpGetJson/httpRequest/fetch", () => {
  const root = fileURLToPath(REPO_ROOT);
  const offenders = [];
  let tdxCallers = 0;

  for (const dir of ["lib", "app"]) {
    for (const abs of listSourceFiles(path.join(root, dir))) {
      const rel = path.relative(root, abs).split(path.sep).join("/");
      if (EXEMPT.has(rel)) continue;

      const src = stripComments(fs.readFileSync(abs, "utf8"));
      const isTdxCaller = /getTdxToken\(|tdx\.transportdata\.tw\/api|TDX_SENIORS_API_BASE/.test(src);
      if (!isTdxCaller) continue;
      tdxCallers += 1;

      if (/\bhttpGetJson\b|\bhttpRequest\b|\bhttpGetText\b|\bfetch\(/.test(src)) offenders.push(rel);
    }
  }

  assert.ok(tdxCallers >= 6, `expected the sweep to find the known TDX callers, found ${tdxCallers}`);
  assert.deepEqual(offenders, [], `TDX callers bypassing tdxGetJsonWithRetry: ${offenders.join(", ")}`);
});
