/**
 * Next.js instrumentation hook (stable since Next 15, no config flag needed).
 * `register()` runs once per runtime the server boots — both `nodejs` and
 * `edge` — so this starts the in-process sync-job scheduler exactly once, in
 * the Node.js runtime, and only in production (never under `next dev`; local
 * dev has never had these jobs firing). See
 * docs/specs/in-app-cron-scheduler.md for the full design.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production") {
    const { registerCronJobs } = await import("@/lib/server/cron/registerJobs");
    registerCronJobs();
  }
}
