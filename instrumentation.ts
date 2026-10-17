/**
 * Next.js instrumentation hook (stable since Next 15, no config flag needed).
 * `register()` runs once per runtime the server boots — both `nodejs` and
 * `edge` — so this starts the in-process sync-job scheduler exactly once, in
 * the Node.js runtime, and only in production (never under `next dev`; local
 * dev has never had these jobs firing). See
 * docs/specs/in-app-cron-scheduler.md for the full design.
 *
 * It also starts the five-minute `proc_resources` log line (issue #709,
 * lib/server/logging/procResourceLogger.ts), which has its own production-only
 * gate (PROC_RESOURCE_LOG=1 forces it on elsewhere, =0 off in production).
 * Every import stays inside the `NEXT_RUNTIME === "nodejs"` block so the edge
 * bundle never sees node:fs / node:perf_hooks.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    let activeJobs: (() => string[]) | undefined;
    if (process.env.NODE_ENV === "production") {
      const { registerCronJobs, getActiveCronJobNames } = await import("@/lib/server/cron/registerJobs");
      registerCronJobs();
      activeJobs = getActiveCronJobNames;
    }

    try {
      const { startProcResourceLogger } = await import("@/lib/server/logging/procResourceLogger");
      startProcResourceLogger({
        extraFields: activeJobs ? () => ({ activeJobs: activeJobs() }) : undefined,
      });
    } catch {
      // Diagnostics must never stop the server from booting.
    }
  }
}
