/**
 * Resolves on the next turn of the event loop (check phase, after pending I/O
 * callbacks), so a long synchronous loop can be cut into slices that let
 * incoming HTTP requests, timers and the PM2/health probes be served in
 * between. `await Promise.resolve()` would not do: it only drains microtasks
 * and never lets the event loop move on.
 *
 * health-web is a single process that serves site traffic and runs every
 * in-app cron job on one thread, so a bulk sync must not hold it for more than
 * a few milliseconds at a time.
 */
export const yieldToEventLoop = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));
