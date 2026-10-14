import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// First live run of the TDX facility sources (2026-10-14): nearly every county
// came back 429, so tdx_parking fetched 0 rows and tdx_aps only 125 — nothing
// retried. A first fix added fixed-schedule retry/back-off, but a second live
// run (same day) still left tdx_parking at 0 rows. Probing TDX directly in
// isolation found why: `ratelimit-limit: 5` per minute, shared across the
// whole client credential (confirmed via the `ratelimit-reset` header
// counting down 13→10 across 5 back-to-back calls to one endpoint alone) —
// not per-endpoint, not per-county. tdx_parking alone needs ~88 requests.
// Fixed with a shared process-wide limiter (rateLimiter.ts) instead of a
// fixed back-off schedule.

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
const { createTdxRateLimiter, TDX_BASIC_TIER_SPACING_MS } = await import("../lib/server/tdx/rateLimiter.ts");

// --- rateLimiter.ts ---------------------------------------------------

function fakeClock(startMs = 0) {
  let nowMs = startMs;
  const sleeps = [];
  return {
    now: () => nowMs,
    sleep: async (ms) => {
      sleeps.push(ms);
      nowMs += ms; // advance the fake clock exactly as real time would
    },
    sleeps,
    advance: (ms) => {
      nowMs += ms;
    },
  };
}

test("rateLimiter spaces acquire() calls exactly spacingMs apart", async () => {
  const { now, sleep, sleeps } = fakeClock();
  const limiter = createTdxRateLimiter(1000, { now, sleep });
  await limiter.acquire(); // first call: no wait
  await limiter.acquire();
  await limiter.acquire();
  assert.deepEqual(sleeps, [1000, 1000]);
});

test("rateLimiter does not make a caller wait if enough real time already passed", async () => {
  const { now, sleep, sleeps, advance } = fakeClock();
  const limiter = createTdxRateLimiter(1000, { now, sleep });
  await limiter.acquire();
  advance(1500); // caller was busy elsewhere for longer than the spacing
  await limiter.acquire();
  assert.deepEqual(sleeps, []);
});

test("acquire() reserves its slot (writes nextAllowedAtMs) before its only await, so concurrent callers can't race on it", () => {
  const src = fs.readFileSync(new URL("lib/server/tdx/rateLimiter.ts", REPO_ROOT), "utf8");
  const acquireStart = src.indexOf("async acquire()");
  const body = src.slice(acquireStart, src.indexOf("reportRateLimited(", acquireStart));
  const beforeAwait = body.slice(0, body.indexOf("await sleep"));
  assert.match(beforeAwait, /nextAllowedAtMs = slot \+ spacingMs/, "the reservation write must happen before the only await in acquire()");
});

test("reportRateLimited pushes the next slot out to the reported reset, not just spacingMs", async () => {
  const { now, sleep, sleeps } = fakeClock();
  const limiter = createTdxRateLimiter(1000, { now, sleep });
  await limiter.acquire(); // slot 0, no wait, no sleep() call recorded
  limiter.reportRateLimited(30); // TDX says: 30s until the window clears
  await limiter.acquire();
  assert.equal(sleeps[0], 30_000 + 500);
});

test("production singleton uses the measured 5-req/min spacing", () => {
  assert.equal(TDX_BASIC_TIER_SPACING_MS, 13_000);
});

// --- getJsonWithRetry.ts ------------------------------------------------

const fakeLimiter = () => {
  const calls = [];
  return { acquire: async () => calls.push("acquire"), reportRateLimited: (s) => calls.push(`report:${s}`), calls };
};

const fakeRequest = (responses) => {
  const calls = [];
  const request = async (url, opts) => {
    calls.push({ url, auth: opts.headers.authorization });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    return { status: r.status, headers: r.headers ?? {}, buffer: Buffer.from(r.body ?? "") };
  };
  return { calls, request };
};

test("retries 429 using the ratelimit-reset header, then returns the 200 body", async () => {
  const limiter = fakeLimiter();
  const { calls, request } = fakeRequest([
    { status: 429, headers: { "ratelimit-reset": "7" } },
    { status: 200, body: '{"Items":[1,2]}' },
  ]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter, request });
  assert.equal(res.status, 200);
  assert.deepEqual(res.data, { Items: [1, 2] });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].auth, "Bearer tok");
  assert.deepEqual(limiter.calls, ["acquire", "report:7", "acquire"]);
});

test("falls back to fallbackResetMs when the 429 has no ratelimit-reset header", async () => {
  const limiter = fakeLimiter();
  const { request } = fakeRequest([{ status: 429, headers: {} }, { status: 200, body: "{}" }]);
  await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter, request, fallbackResetMs: 65_000 });
  assert.deepEqual(limiter.calls, ["acquire", "report:65", "acquire"]);
});

test("gives up after maxRetries and returns the 429 without parsing its non-JSON body", async () => {
  const limiter = fakeLimiter();
  const { calls, request } = fakeRequest([{ status: 429, headers: {}, body: "<html>Too Many Requests</html>" }]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter, request, maxRetries: 2 });
  assert.equal(res.status, 429);
  assert.equal(res.data, null);
  assert.equal(calls.length, 3);
});

test("does not retry other errors", async () => {
  const limiter = fakeLimiter();
  const { calls, request } = fakeRequest([{ status: 400, headers: {} }]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter, request });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 1);
});

test("acquires a slot from the limiter before every attempt, including retries", async () => {
  const limiter = fakeLimiter();
  const { request } = fakeRequest([{ status: 429, headers: { "ratelimit-reset": "1" } }, { status: 200, body: "{}" }]);
  await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter, request });
  assert.equal(limiter.calls.filter((c) => c === "acquire").length, 2);
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
