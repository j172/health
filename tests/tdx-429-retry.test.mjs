import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// First live run of the TDX facility sources (2026-10-14): nearly every county
// came back 429, so tdx_parking fetched 0 rows and tdx_aps only 125 — nothing
// retried, and each per-county failure was only a console.warn.

const REPO_ROOT = new URL("../", import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { tdxGetJsonWithRetry } = await import("../lib/server/tdx/getJsonWithRetry.ts");

const fakeGet = (statuses) => {
  const calls = [];
  const getText = async (url, opts) => {
    calls.push({ url, auth: opts.headers.authorization });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)];
    return { status, text: status === 200 ? '{"Items":[1,2]}' : "<html>Too Many Requests</html>" };
  };
  return { calls, getText };
};

test("retries 429 with doubling back-off, then returns the 200 body", async () => {
  const { calls, getText } = fakeGet([429, 429, 200]);
  const delays = [];
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { getText, sleep: async (ms) => delays.push(ms), baseDelayMs: 100 });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { Items: [1, 2] });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].auth, "Bearer tok");
  assert.deepEqual(delays, [100, 200]);
});

test("gives up after maxRetries and returns the 429 without parsing its non-JSON body", async () => {
  const { calls, getText } = fakeGet([429]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { getText, sleep: async () => {}, maxRetries: 2 });
  assert.equal(res.status, 429);
  assert.equal(res.data, null);
  assert.equal(calls.length, 3);
});

test("does not retry other errors", async () => {
  const { calls, getText } = fakeGet([400]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { getText, sleep: async () => {} });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 1);
});

test("both TDX facility sources use the retrying GET, and parking runs one county-kind at a time", () => {
  const read = (p) => fs.readFileSync(new URL(p, REPO_ROOT), "utf8");
  for (const f of ["lib/server/facilities/sources/tdxAudibleSignals.ts", "lib/server/facilities/sources/tdxParking.ts"]) {
    const src = read(f);
    assert.match(src, /tdxGetJsonWithRetry/, f);
    assert.doesNotMatch(src, /httpGetJson/, f);
  }
  assert.match(read("lib/server/facilities/sources/tdxParking.ts"), /const batchSize = 1;/);
});
