// TDX 斷路器（circuitBreaker.ts）與它在 tdxGetJsonWithRetry 裡的接線。
//
// 背景：2026-10-15 起 token 請求被拒（HTTP 400 unauthorized_client，憑證被拒）、公車同步全部 429，
// TDX 也通知點數用量超過 100%；每個 cron tick 仍照打，繼續耗點又白占共用限流器。斷路器要做到：
// 被拒絕就暫停、15 → 30 → 60 分鐘退避、到期只放一次探測、成功即重置；而且絕不能把「一般的每分鐘
// 節流」或「沒有 HTTP 回應的網路錯誤」當成被封鎖。
import test from "node:test";
import assert from "node:assert/strict";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const {
  createTdxCircuitBreaker,
  describeTdxBreaker,
  TDX_BREAKER_BACKOFF_MS,
} = await import("./circuitBreaker.ts");
const { tdxGetJsonWithRetry, TDX_CIRCUIT_OPEN_STATUS, TDX_QUOTA_RESET_THRESHOLD_SECONDS } = await import(
  "./getJsonWithRetry.ts"
);

const MIN = 60_000;

/** A breaker on a clock the test moves by hand; every warning is captured instead of printed. */
function makeBreaker(overrides = {}) {
  let nowMs = 1_000_000;
  const warnings = [];
  const breaker = createTdxCircuitBreaker({
    now: () => nowMs,
    warn: (message) => warnings.push(message),
    ...overrides,
  });
  return {
    breaker,
    warnings,
    advance: (ms) => {
      nowMs += ms;
    },
    now: () => nowMs,
  };
}

// --- the state machine ------------------------------------------------------------------------

test("starts closed: requests are allowed and nothing is blocked", () => {
  const { breaker } = makeBreaker();
  assert.equal(breaker.isBlocked(), false);
  assert.equal(breaker.acquire(), "allowed");
  assert.equal(breaker.snapshot().state, "closed");
  assert.equal(breaker.snapshot().openUntilMs, null);
});

test("the default backoff is 15 → 30 → 60 minutes", () => {
  assert.deepEqual([...TDX_BREAKER_BACKOFF_MS], [15 * MIN, 30 * MIN, 60 * MIN]);
});

test("a failure opens the breaker for 15 minutes, during which nothing is sent", () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("token_rejected", "allowed");

  assert.equal(breaker.snapshot().state, "open");
  assert.equal(breaker.snapshot().backoffMs, 15 * MIN);
  assert.equal(breaker.isBlocked(), true);
  assert.equal(breaker.acquire(), "blocked");

  advance(15 * MIN - 1);
  assert.equal(breaker.isBlocked(), true, "one millisecond early is still blocked");
  assert.equal(breaker.acquire(), "blocked");
});

test("when the backoff elapses exactly ONE probe goes out (half-open); everyone else stays blocked until it reports", () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("quota_exceeded", "allowed");
  advance(15 * MIN);

  assert.equal(breaker.isBlocked(), false, "a probe is available, so a cached token may be handed out");
  assert.equal(breaker.acquire(), "probe");
  assert.equal(breaker.snapshot().state, "half_open");

  assert.equal(breaker.isBlocked(), true, "the probe is in flight");
  assert.equal(breaker.acquire(), "blocked");
  assert.equal(breaker.acquire(), "blocked");
});

test("a successful probe closes the breaker and forgets the backoff (the next trip is 15 minutes again)", () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("rate_limited", "allowed");
  advance(15 * MIN);
  const gate = breaker.acquire();
  breaker.recordFailure("rate_limited", gate); // the first probe fails: now at 30 minutes
  assert.equal(breaker.snapshot().backoffMs, 30 * MIN);
  advance(30 * MIN);
  const probe = breaker.acquire();
  assert.equal(probe, "probe");
  breaker.recordSuccess(probe);

  assert.equal(breaker.snapshot().state, "closed");
  assert.equal(breaker.acquire(), "allowed");

  breaker.recordFailure("rate_limited", "allowed");
  assert.equal(breaker.snapshot().backoffMs, 15 * MIN, "success resets the escalation");
});

test("a failed probe escalates 15 → 30 → 60 and then stays at the 60 minute ceiling", () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("token_rejected", "allowed");
  const seen = [breaker.snapshot().backoffMs];

  for (let i = 0; i < 4; i++) {
    advance(breaker.snapshot().backoffMs);
    const gate = breaker.acquire();
    assert.equal(gate, "probe");
    breaker.recordFailure("token_rejected", gate);
    seen.push(breaker.snapshot().backoffMs);
  }
  assert.deepEqual(seen, [15 * MIN, 30 * MIN, 60 * MIN, 60 * MIN, 60 * MIN]);
});

test("late failures from requests sent before it opened neither extend nor escalate the backoff", () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("rate_limited", "allowed");
  const until = breaker.snapshot().openUntilMs;
  advance(5 * MIN);
  breaker.recordFailure("rate_limited", "allowed"); // a queued call that finished late
  breaker.recordFailure("forbidden", "allowed");
  assert.equal(breaker.snapshot().openUntilMs, until);
  assert.equal(breaker.snapshot().backoffMs, 15 * MIN);
  assert.equal(breaker.snapshot().trips, 1);

  // Same while half-open: only the probe's own verdict counts.
  advance(10 * MIN);
  const probe = breaker.acquire();
  breaker.recordFailure("rate_limited", "allowed");
  assert.equal(breaker.snapshot().state, "half_open");
  breaker.recordSuccess("allowed");
  assert.equal(breaker.snapshot().state, "half_open", "a stale success does not close it either");
  breaker.recordSuccess(probe);
  assert.equal(breaker.snapshot().state, "closed");
});

test("a probe that ends without a verdict (timeout, 5xx) is handed back so the next request can probe", () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("token_rejected", "allowed");
  advance(15 * MIN);
  const first = breaker.acquire();
  breaker.releaseProbe(first);
  assert.equal(breaker.snapshot().state, "half_open");
  assert.equal(breaker.snapshot().backoffMs, 15 * MIN, "no escalation without a verdict");
  assert.equal(breaker.acquire(), "probe");
});

test("a probe that never reports back does not wedge the breaker: after the lease another request may probe", () => {
  const { breaker, advance } = makeBreaker({ probeLeaseMs: 5 * MIN });
  breaker.recordFailure("token_rejected", "allowed");
  advance(15 * MIN);
  assert.equal(breaker.acquire(), "probe");
  advance(5 * MIN - 1);
  assert.equal(breaker.acquire(), "blocked");
  advance(1);
  assert.equal(breaker.isBlocked(), false);
  assert.equal(breaker.acquire(), "probe");
});

test("settleTokenRequest: a good token only hands the probe back, a rejected one opens, no HTTP answer never opens", () => {
  // Rejected (400 invalid_client, 403, 5xx all mean "an HTTP answer that is not a token").
  for (const [status, reason] of [
    [400, "token_rejected"],
    [403, "token_rejected"],
    [503, "token_rejected"],
    [429, "rate_limited"],
  ]) {
    const { breaker } = makeBreaker();
    breaker.settleTokenRequest(breaker.acquire(), { ok: false, httpStatus: status });
    assert.equal(breaker.snapshot().state, "open", `status ${status}`);
    assert.equal(breaker.snapshot().reason, reason, `status ${status}`);
  }

  // Timeout / connection reset: no verdict, stays closed.
  const noAnswer = makeBreaker();
  noAnswer.breaker.settleTokenRequest(noAnswer.breaker.acquire(), { ok: false, httpStatus: null });
  assert.equal(noAnswer.breaker.snapshot().state, "closed");

  // A good token during half-open does NOT close it (only a real API answer does) but frees the probe.
  const recovering = makeBreaker();
  recovering.breaker.recordFailure("token_rejected", "allowed");
  recovering.advance(15 * MIN);
  const probe = recovering.breaker.acquire();
  recovering.breaker.settleTokenRequest(probe, { ok: true, httpStatus: 200 });
  assert.equal(recovering.breaker.snapshot().state, "half_open");
  assert.equal(recovering.breaker.isBlocked(), false);
  assert.equal(recovering.breaker.acquire(), "probe", "the API call that follows becomes the probe");
});

test("reset() returns to closed, so tests (and an operator) can start clean", () => {
  const { breaker } = makeBreaker();
  breaker.recordFailure("forbidden", "allowed");
  breaker.reset();
  assert.equal(breaker.snapshot().state, "closed");
  assert.equal(breaker.acquire(), "allowed");
});

test("log lines carry state and timings only: no token, no credential, no response body", () => {
  const { breaker, warnings, advance } = makeBreaker();
  breaker.recordFailure("token_rejected", "allowed");
  advance(15 * MIN);
  const probe = breaker.acquire();
  breaker.recordSuccess(probe);

  assert.equal(warnings.length, 3, "OPEN, HALF-OPEN, CLOSED — one line per transition");
  for (const line of warnings) {
    assert.match(line, /^\[tdx-breaker\] /);
    assert.doesNotMatch(line, /secret|password|bearer|client_id|access_token/i);
  }
  assert.match(describeTdxBreaker({ state: "open", backoffMs: 15 * MIN, openUntilMs: 0, reason: "quota_exceeded", trips: 1 }), /quota_exceeded/);
  assert.equal(describeTdxBreaker({ state: "closed", backoffMs: null, openUntilMs: null, reason: null, trips: 0 }), "circuit breaker closed");
});

// --- tdxGetJsonWithRetry + the breaker ----------------------------------------------------------

/** A limiter that records calls and can run a hook while a caller is "waiting in the queue". */
const fakeLimiter = (onAcquire) => {
  const calls = [];
  return {
    calls,
    acquire: async () => {
      calls.push("acquire");
      if (onAcquire) await onAcquire(calls.filter((c) => c === "acquire").length);
    },
    reportRateLimited: (s) => calls.push(`report:${s}`),
  };
};

const fakeRequest = (responses) => {
  const calls = [];
  const request = async (url, opts) => {
    calls.push({ url, auth: opts.headers.authorization });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return { status: r.status, headers: r.headers ?? {}, buffer: Buffer.from(r.body ?? "") };
  };
  return { calls, request };
};

test("a 429 that clears on retry never opens the breaker", async () => {
  const { breaker } = makeBreaker();
  const { request } = fakeRequest([{ status: 429, headers: { "ratelimit-reset": "7" } }, { status: 200, body: "[1]" }]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request, breaker });
  assert.equal(res.status, 200);
  assert.equal(breaker.snapshot().state, "closed");
});

test("a 429 that survives every retry opens the breaker; the next call is refused without any request being sent", async () => {
  const { breaker } = makeBreaker();
  const first = fakeRequest([{ status: 429, headers: { "ratelimit-reset": "10" } }]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", {
    limiter: fakeLimiter(),
    request: first.request,
    breaker,
    maxRetries: 2,
  });
  assert.equal(res.status, 429);
  assert.equal(first.calls.length, 3);
  assert.equal(breaker.snapshot().state, "open");
  assert.equal(breaker.snapshot().reason, "rate_limited");

  const second = fakeRequest([{ status: 200, body: "[]" }]);
  const refused = await tdxGetJsonWithRetry("https://tdx/y", "tok", { limiter: fakeLimiter(), request: second.request, breaker });
  assert.equal(refused.status, TDX_CIRCUIT_OPEN_STATUS);
  assert.equal(refused.circuitOpen, true);
  assert.equal(refused.data, null);
  assert.equal(second.calls.length, 0, "an open breaker sends nothing to TDX");
});

test("a 429 whose ratelimit-reset is a quota window (not the per-minute throttle) opens at once, with no retry and no limiter stall", async () => {
  const { breaker } = makeBreaker();
  const limiter = fakeLimiter();
  const { calls, request } = fakeRequest([
    { status: 429, headers: { "ratelimit-reset": String(TDX_QUOTA_RESET_THRESHOLD_SECONDS + 1) } },
  ]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter, request, breaker });
  assert.equal(res.status, 429);
  assert.equal(calls.length, 1, "waiting out a quota window in-process is pointless");
  assert.equal(breaker.snapshot().reason, "quota_exceeded");
  assert.ok(!limiter.calls.some((c) => c.startsWith("report:")), "a reset of hours must not park the shared limiter");
});

test("a reset at the per-minute scale (60 s) is still retried, not treated as a quota window", async () => {
  const { breaker } = makeBreaker();
  const limiter = fakeLimiter();
  const { calls, request } = fakeRequest([{ status: 429, headers: { "ratelimit-reset": "60" } }, { status: 200, body: "{}" }]);
  await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter, request, breaker });
  assert.equal(calls.length, 2);
  assert.deepEqual(limiter.calls, ["acquire", "report:60", "acquire"]);
  assert.equal(breaker.snapshot().state, "closed");
});

test("a 403 opens the breaker (it is not retried) and is returned as-is", async () => {
  const { breaker } = makeBreaker();
  const { calls, request } = fakeRequest([{ status: 403, body: "<html>Forbidden</html>" }]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request, breaker });
  assert.deepEqual(res, { status: 403, data: null });
  assert.equal(calls.length, 1);
  assert.equal(breaker.snapshot().reason, "forbidden");
});

test("404, 400, 401 and 5xx are not quota signals: the breaker stays closed", async () => {
  for (const status of [400, 401, 404, 500, 502]) {
    const { breaker } = makeBreaker();
    const { request } = fakeRequest([{ status }]);
    const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request, breaker });
    assert.equal(res.status, status);
    assert.equal(breaker.snapshot().state, "closed", `status ${status}`);
  }
});

test("a request that throws (timeout) rethrows and does not open the breaker", async () => {
  const { breaker } = makeBreaker();
  const { request } = fakeRequest([new Error("socket hang up")]);
  await assert.rejects(
    tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request, breaker }),
    /socket hang up/,
  );
  assert.equal(breaker.snapshot().state, "closed");
});

test("the breaker is checked AFTER the limiter wait: a call queued behind a tripping call sends nothing", async () => {
  const { breaker } = makeBreaker();
  // While the second caller waits in the limiter queue, the first caller's failure opens the breaker.
  const limiter = fakeLimiter(async () => breaker.recordFailure("rate_limited", "allowed"));
  const { calls, request } = fakeRequest([{ status: 200, body: "[]" }]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter, request, breaker });
  assert.equal(res.circuitOpen, true);
  assert.equal(calls.length, 0);
});

test("recovery: after the backoff one call is the probe, and its 200 closes the breaker for everyone", async () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("quota_exceeded", "allowed");
  advance(15 * MIN);

  const ok = fakeRequest([{ status: 200, body: "[1,2]" }]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request: ok.request, breaker });
  assert.deepEqual(res.data, [1, 2]);
  assert.equal(breaker.snapshot().state, "closed");
});

test("recovery: a probe that gets 429 reopens at 30 minutes; a probe that gets a 404 still proves TDX is serving us", async () => {
  const reopened = makeBreaker();
  reopened.breaker.recordFailure("quota_exceeded", "allowed");
  reopened.advance(15 * MIN);
  const refused = fakeRequest([{ status: 429, headers: { "ratelimit-reset": "9999" } }]);
  await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request: refused.request, breaker: reopened.breaker });
  assert.equal(reopened.breaker.snapshot().state, "open");
  assert.equal(reopened.breaker.snapshot().backoffMs, 30 * MIN);

  const notFound = makeBreaker();
  notFound.breaker.recordFailure("quota_exceeded", "allowed");
  notFound.advance(15 * MIN);
  const missing = fakeRequest([{ status: 404 }]);
  await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request: missing.request, breaker: notFound.breaker });
  assert.equal(notFound.breaker.snapshot().state, "closed");
});

test("recovery: the probe keeps its permit across its own 429 retries (it is not blocked by itself)", async () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("quota_exceeded", "allowed");
  advance(15 * MIN);
  const { calls, request } = fakeRequest([{ status: 429, headers: { "ratelimit-reset": "5" } }, { status: 200, body: "[]" }]);
  const res = await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request, breaker });
  assert.equal(res.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(breaker.snapshot().state, "closed");
});

test("recovery: while the probe is in flight a concurrent call is refused instead of becoming a second probe", async () => {
  const { breaker, advance } = makeBreaker();
  breaker.recordFailure("quota_exceeded", "allowed");
  advance(15 * MIN);

  let releaseProbeRequest;
  const probeCalls = [];
  const slowRequest = (url) => {
    probeCalls.push(url);
    return new Promise((resolve) => {
      releaseProbeRequest = () => resolve({ status: 200, headers: {}, buffer: Buffer.from("[]") });
    });
  };
  const probe = tdxGetJsonWithRetry("https://tdx/probe", "tok", { limiter: fakeLimiter(), request: slowRequest, breaker });
  await new Promise((resolve) => setImmediate(resolve));

  const concurrentRequest = fakeRequest([{ status: 200, body: "[]" }]);
  const concurrent = await tdxGetJsonWithRetry("https://tdx/other", "tok", {
    limiter: fakeLimiter(),
    request: concurrentRequest.request,
    breaker,
  });
  assert.equal(concurrent.circuitOpen, true);
  assert.equal(concurrentRequest.calls.length, 0);

  releaseProbeRequest();
  assert.equal((await probe).status, 200);
  assert.equal(breaker.snapshot().state, "closed");
  assert.deepEqual(probeCalls, ["https://tdx/probe"]);
});

test("the shared singleton is what every caller gets by default (one process, one credential, one breaker)", async (t) => {
  const { tdxCircuitBreaker } = await import("./circuitBreaker.ts");
  t.mock.method(console, "warn", () => {}); // the singleton logs its OPEN line to the real console
  tdxCircuitBreaker.reset();
  const { request } = fakeRequest([{ status: 403 }]);
  await tdxGetJsonWithRetry("https://tdx/x", "tok", { limiter: fakeLimiter(), request });
  assert.equal(tdxCircuitBreaker.snapshot().state, "open");
  tdxCircuitBreaker.reset();
});
