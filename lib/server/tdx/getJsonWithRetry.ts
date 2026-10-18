import { httpRequest } from "@/lib/server/net/httpClient";
import { tdxRateLimiter, type TdxRateLimiter } from "@/lib/server/tdx/rateLimiter";
import { tdxCircuitBreaker, type TdxCircuitBreaker, type TdxGate } from "@/lib/server/tdx/circuitBreaker";

/**
 * Status handed back (with `circuitOpen: true`) when the circuit breaker refused the call and
 * nothing was sent to TDX. 503 rather than 429 so a log line reading "returned status 503" can be
 * told apart from a real TDX rate-limit answer.
 */
export const TDX_CIRCUIT_OPEN_STATUS = 503;

/**
 * A 429 whose `ratelimit-reset` is longer than this is not the per-minute throttle (TDX's window is
 * 60 s; the header counts 13→10 s in the probe documented in rateLimiter.ts) but a quota window
 * (hours or days): waiting it out in-process is pointless, so the breaker opens straight away.
 */
export const TDX_QUOTA_RESET_THRESHOLD_SECONDS = 120;

export interface TdxRetryOptions {
  timeoutMs?: number;
  /** Retries after the first 429; default 3. */
  maxRetries?: number;
  /** Wait applied on a 429 with no (or unparseable) ratelimit-reset header; default 65s — just past TDX's observed 60s window. */
  fallbackResetMs?: number;
  /** Injected for tests; defaults to the shared process-wide limiter. */
  limiter?: TdxRateLimiter;
  /** Injected for tests; defaults to the shared process-wide circuit breaker. */
  breaker?: TdxCircuitBreaker;
  /** Injected for tests. */
  request?: typeof httpRequest;
}

export interface TdxJsonResult<T> {
  status: number;
  data: T | null;
  /** True when the circuit breaker refused the call: no request reached TDX. */
  circuitOpen?: boolean;
}

/**
 * GETs a TDX JSON endpoint, queuing through the shared rate limiter and
 * retrying on HTTP 429 using the `ratelimit-reset` header TDX sends (seconds
 * until the window clears — see rateLimiter.ts for how this was confirmed).
 *
 * Every attempt also passes the shared circuit breaker (circuitBreaker.ts), checked AFTER the
 * limiter wait because the breaker may have opened while this call sat in the queue: a call that
 * finds it open returns `{ status: 503, circuitOpen: true }` without touching TDX. A 429 that
 * survives all retries, a 429 with a quota-sized reset, and any 403 open the breaker.
 *
 * Returns `{ status, data }` like httpGetJson; `data` is only parsed for a
 * 200, so a non-JSON error body never throws here.
 */
export async function tdxGetJsonWithRetry<T>(
  url: string,
  token: string,
  options: TdxRetryOptions = {},
): Promise<TdxJsonResult<T>> {
  const {
    timeoutMs = 12000,
    maxRetries = 3,
    fallbackResetMs = 65_000,
    limiter = tdxRateLimiter,
    breaker = tdxCircuitBreaker,
    request = httpRequest,
  } = options;

  let gate: TdxGate = "allowed";

  for (let attempt = 0; ; attempt++) {
    await limiter.acquire();

    // The half-open probe is held across this call's own retries; everyone else asks again each attempt.
    if (gate !== "probe") {
      gate = breaker.acquire();
      if (gate === "blocked") return { status: TDX_CIRCUIT_OPEN_STATUS, data: null, circuitOpen: true };
    }

    let res: Awaited<ReturnType<typeof httpRequest>>;
    try {
      res = await request(url, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        timeoutMs,
      });
    } catch (err) {
      breaker.releaseProbe(gate);
      throw err;
    }

    if (res.status === 429) {
      const resetHeader = res.headers["ratelimit-reset"] ?? res.headers["x-ratelimit-reset"];
      const resetSeconds = Number(Array.isArray(resetHeader) ? resetHeader[0] : resetHeader);
      const isQuotaWindow = Number.isFinite(resetSeconds) && resetSeconds > TDX_QUOTA_RESET_THRESHOLD_SECONDS;

      if (!isQuotaWindow && attempt < maxRetries) {
        limiter.reportRateLimited(Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds : fallbackResetMs / 1000);
        continue;
      }
      // Retries exhausted, or the "reset" is a quota window. Deliberately NOT fed to the limiter: a
      // reset of hours would park every other TDX caller's queue slot for hours; the breaker owns it.
      breaker.recordFailure(isQuotaWindow ? "quota_exceeded" : "rate_limited", gate);
      return { status: 429, data: null };
    }

    if (res.status === 403) {
      breaker.recordFailure("forbidden", gate);
      return { status: 403, data: null };
    }

    // 401 (stale token) and 5xx say nothing about our quota; anything else proves TDX is serving us.
    if (res.status === 401 || res.status >= 500) breaker.releaseProbe(gate);
    else breaker.recordSuccess(gate);

    const text = res.buffer.toString("utf-8");
    return { status: res.status, data: res.status === 200 ? (JSON.parse(text) as T) : null };
  }
}
