# Per-job memory monitoring for the in-app cron scheduler

## Context

2026-09-23: a recurring `RangeError: WebAssembly.instantiate(): Out of memory` crash loop (health-web restarting every few minutes to ~1 hour, self-healed each time by the watchdog's `apply-prebuilt-force`) persisted after three unrelated, real bugs were found and fixed the same night (PM2 duplicate-daemon dedup, Cloudflare AI call circuit-breaking, an `ensureSchema()` concurrency deadlock — see `docs/memory/ops_health_502_watchdog.md` and the three PRs it references). None of those three explain the WASM OOM itself.

`health-web` runs under a deliberately capped `--max-old-space-size=768` heap (`docs/specs/hawkhost-server-optimization.md` — kept low so memory pressure surfaces as a catchable V8/WASM error instead of the host's CloudLinux LVE governor silently SIGKILLing the process). The same process also runs `lib/server/cron/registerJobs.ts`'s `registerCronJobs()`: 25+ in-app `node-cron` jobs (RSS ingestion, AQI/CWA/earthquake/WRA/AQX sync, news card image assignment, culture/NPO/social sync, etc.), all sharing that one 768MB budget while simultaneously serving live site traffic.

The most recent crash's log tail showed `[persistItems]` / `[revalidateArticlePath]` lines (RSS ingestion's tail end) immediately before the WASM OOM, which is suggestive but not proof — plenty of other jobs run on overlapping schedules, and the existing per-job cron log files (`logs/{job}-cron.log`) each only record their own start/end with no memory data and no visibility into what else was running at the same time.

Decision (confirmed via `/grill`, 2026-09-23): before changing any ingestion/sync code, add measurement to find the actual peak memory source — the earlier NPROC/host-contention investigation (`docs/memory/project_2026_09_20_backlog_grilling_and_diagnosis.md`) found that a plausible-sounding guess ("it's probably the biggest job") was wrong once real data was collected, so the same discipline applies here: **don't optimize by guessing**.

## What this adds

`runGuarded()` (the wrapper every one of the 25+ `cron.schedule(...)` calls in `registerJobs.ts` already goes through) now brackets each run with two entries appended to `logs/memory-monitor.log`:

- **`start`**: job name, `process.memoryUsage()` snapshot (rss/heapUsed/external/arrayBuffers, in MB), and the full list of job names currently active (a module-level `Set<string>` shared across every `runGuarded()` closure).
- **`end`**: job name, run duration, the same memory snapshot taken again, the memory delta since `start`, and the active-jobs list with this job removed.

The job name is derived from the existing `{job}-cron.log` filename convention (`jobNameFromLogFile`), so none of the 25+ call sites needed to change — only `runGuarded` itself.

This is pure observability: no ingestion/sync logic, schedule, or behavior changes. Risk is limited to `appendLog`'s existing `fs.appendFile` failure modes, which were already present and already swallowed by nothing failing the job itself (a log-write failure here would reject the `appendLog` promise inside `runGuarded`, which is awaited — see follow-up note below on why that's acceptable for a diagnostic addition and not hardened further).

## Reading the data

Once deployed, `logs/memory-monitor.log` accumulates one JSON line per job start/end. After a few hours (enough to span several ticks of the 30-minute-cadence jobs and ideally at least one more OOM), look for:

1. Which job's `end` entry immediately precedes a WASM OOM in `health-web-error-*.log` (correlate by timestamp).
2. Whether `activeJobs` at that `start`/`end` ever contains more than 2-3 names — i.e., whether jobs are actually overlapping in practice despite the minute-offset scheduling already used to avoid *starting* at the same tick (a long-running job can still still be mid-flight when the next one's tick fires).
3. Which job(s) have the largest consistent `memoryDeltaMb.rss` — the actual peak contributor(s), rather than the one that happens to log last before a crash.

## Out of scope for this change

- Not optimizing any specific job's memory usage yet — that's the next step, informed by this data.
- Not adding a circuit breaker, backpressure, or job-level memory cap — same reason.
- Not persisting this data anywhere queryable beyond the flat log file — a flat file is enough for a few hours of manual `tail`/`grep` analysis; revisit if this needs to become permanent infrastructure.
