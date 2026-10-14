import { httpRequest } from "@/lib/server/net/httpClient";
import { tdxRateLimiter, type TdxRateLimiter } from "@/lib/server/tdx/rateLimiter";

export interface TdxRetryOptions {
  timeoutMs?: number;
  /** Retries after the first 429; default 3. */
  maxRetries?: number;
  /** Wait applied on a 429 with no (or unparseable) ratelimit-reset header; default 65s — just past TDX's observed 60s window. */
  fallbackResetMs?: number;
  /** Injected for tests; defaults to the shared process-wide limiter. */
  limiter?: TdxRateLimiter;
  /** Injected for tests. */
  request?: typeof httpRequest;
}

/**
 * GETs a TDX JSON endpoint, queuing through the shared rate limiter and
 * retrying on HTTP 429 using the `ratelimit-reset` header TDX sends (seconds
 * until the window clears — see rateLimiter.ts for how this was confirmed).
 *
 * Returns `{ status, data }` like httpGetJson; `data` is only parsed for a
 * 200, so a non-JSON error body never throws here.
 */
export async function tdxGetJsonWithRetry<T>(
  url: string,
  token: string,
  options: TdxRetryOptions = {},
): Promise<{ status: number; data: T | null }> {
  const {
    timeoutMs = 12000,
    maxRetries = 3,
    fallbackResetMs = 65_000,
    limiter = tdxRateLimiter,
    request = httpRequest,
  } = options;

  for (let attempt = 0; ; attempt++) {
    await limiter.acquire();
    const res = await request(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      timeoutMs,
    });

    if (res.status === 429 && attempt < maxRetries) {
      const resetHeader = res.headers["ratelimit-reset"] ?? res.headers["x-ratelimit-reset"];
      const resetSeconds = Number(Array.isArray(resetHeader) ? resetHeader[0] : resetHeader);
      limiter.reportRateLimited(Number.isFinite(resetSeconds) && resetSeconds > 0 ? resetSeconds : fallbackResetMs / 1000);
      continue;
    }

    const text = res.buffer.toString("utf-8");
    return { status: res.status, data: res.status === 200 ? (JSON.parse(text) as T) : null };
  }
}
