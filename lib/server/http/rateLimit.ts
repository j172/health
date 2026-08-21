import "server-only";

/**
 * Fixed-window in-memory rate limiter.
 *
 * Deliberately process-local: this app runs as a single PM2 instance
 * (`ecosystem.config.cjs`, app name `health-web`), so there is nothing to share
 * state with, and a Redis dependency would be a new failure mode on a host that
 * already runs close to its memory ceiling.
 *
 * The bucket map is bounded and swept, because the keys are caller-controlled
 * (client IP) and an unbounded map keyed on untrusted input is exactly the leak
 * this codebase already had in lib/server/cache/memo.ts.
 */

type Bucket = { count: number; resetAt: number };

const MAX_TRACKED_KEYS = 5_000;
const buckets = new Map<string, Bucket>();

const sweep = (now: number): void => {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  // Everything still live and still over the cap: drop oldest-first.
  while (buckets.size >= MAX_TRACKED_KEYS) {
    const oldest = buckets.keys().next();
    if (oldest.done) break;
    buckets.delete(oldest.value);
  }
};

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets — suitable for a Retry-After header. */
  retryAfterSeconds: number;
}

/**
 * Consumes one token for `key`. Returns whether the caller is under the limit.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) sweep(now);
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { allowed: true, retryAfterSeconds: windowSeconds };
  }

  existing.count += 1;
  const retryAfterSeconds = Math.max(
    1,
    Math.ceil((existing.resetAt - now) / 1000),
  );
  return { allowed: existing.count <= limit, retryAfterSeconds };
}

/**
 * Best-effort client address.
 *
 * Production sits behind a PHP handler proxy and Cloudflare, so the socket
 * address is always the proxy. Prefer the headers Cloudflare sets, then the
 * first hop in X-Forwarded-For.
 */
export function clientAddress(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();

  return headers.get("x-real-ip") ?? "unknown";
}
