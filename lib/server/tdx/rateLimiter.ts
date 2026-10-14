/**
 * Shared process-wide throttle for TDX's "basic" tier.
 *
 * Confirmed live 2026-10-14 by probing `/v1/Parking/OffStreet/CarPark/City/Taipei`
 * in isolation (no other TDX traffic in flight): response headers were
 * `ratelimit-limit: 5`, `ratelimit-remaining: 4→0`, `ratelimit-reset: 13→10` —
 * i.e. **5 requests per minute, shared across the whole client credential**,
 * not per-endpoint or per-county. tdx_aps needs ~22 requests and tdx_parking
 * needs ~88 (44 county×kind pairs × 2 endpoints each); firing them without a
 * shared limiter is what made tdx_parking fetch 0 rows and tdx_aps only 125
 * on the first live run, even with per-call retry/back-off (see
 * getJsonWithRetry.ts's prior fixed-back-off attempt, same day).
 *
 * `acquire()` reserves the next free slot synchronously (no `await` before
 * `nextAllowedAtMs` is updated), so concurrent callers never race on it —
 * correct under Node's single-threaded execution model.
 */

/** 60_000 / 5 req-per-min, plus headroom so clock/header-second rounding never tips over the real limit. */
export const TDX_BASIC_TIER_SPACING_MS = 13_000;

export interface TdxRateLimiter {
  /** Resolves once it's this caller's turn; reserves the slot before returning. */
  acquire(): Promise<void>;
  /** Call after an HTTP 429: pushes the next slot out to (at least) the reported reset. */
  reportRateLimited(resetSeconds: number): void;
}

export function createTdxRateLimiter(
  spacingMs: number = TDX_BASIC_TIER_SPACING_MS,
  deps: { now?: () => number; sleep?: (ms: number) => Promise<void> } = {},
): TdxRateLimiter {
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let nextAllowedAtMs = 0;

  return {
    async acquire() {
      const slot = Math.max(nextAllowedAtMs, now());
      nextAllowedAtMs = slot + spacingMs;
      const waitMs = slot - now();
      if (waitMs > 0) await sleep(waitMs);
    },
    reportRateLimited(resetSeconds: number) {
      const resumeAt = now() + resetSeconds * 1000 + 500;
      if (resumeAt > nextAllowedAtMs) nextAllowedAtMs = resumeAt;
    },
  };
}

/** The singleton every TDX basic-tier caller in this repo shares by default. */
export const tdxRateLimiter: TdxRateLimiter = createTdxRateLimiter();
