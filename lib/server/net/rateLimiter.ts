/**
 * Creates a throttle function enforcing a minimum interval between calls.
 * Each call to the returned `throttle()` waits (if needed) until at least
 * `intervalMs` has elapsed since the previous call returned, then records the
 * new timestamp — shared shape for rate-limiting calls to third-party APIs
 * with a per-provider request-rate cap.
 */
export const rateLimiter = (intervalMs: number): (() => Promise<void>) => {
  let lastRequestAt = 0;

  return async (): Promise<void> => {
    const wait = intervalMs - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
  };
};
