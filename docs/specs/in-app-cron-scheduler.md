# Feature Specification: In-App Cron Scheduler (node-cron) for Sync Jobs

## Overview

Four of the five production `crontab` entries currently drive Next.js API routes over
an HTTP loopback call (`curl http://127.0.0.1:3000/...`) installed via SSH on every
deploy (`scripts/deploy-crontab.sh` + `scripts/health-app.crontab`, invoked from
`.github/workflows/deploy-ftps.yml`). This spec moves those four jobs into an
in-process scheduler (`node-cron`) that starts when the Next.js server itself starts,
removing their dependency on the host's system crontab and the SSH-based deploy step
that installs it.

The fifth entry, the `pm2-ensure-running` self-heal watchdog, is explicitly **out of
scope** and stays in the system crontab — see [Scope](#1-scope--what-stays-in-crontab).

## 1. Scope — what stays in crontab

| Job | Trigger today | After this change |
|---|---|---|
| `rss-sync` | crontab → `curl` → `/api/internal/rss-sync` | in-app `node-cron` → direct function call |
| `aqi-sync` | crontab → `curl` → `/api/internal/aqi-sync` | in-app `node-cron` → direct function call |
| `cwa-sync` | crontab → `curl` → `/api/admin/cwa-sync` | in-app `node-cron` → direct function call |
| `earthquakes-sync` | crontab → `curl` → `/api/admin/earthquakes-sync` | in-app `node-cron` → direct function call |
| `pm2-ensure-running` | crontab → `curl` (PHP, public vhost) | **unchanged**, stays in crontab |

`pm2-ensure-running` cannot move in-process: its entire purpose is reviving the
`health-web` pm2 process after the host's CloudLinux LVE SIGKILLs it (see
`ecosystem.config.cjs` comments and prior incident history). A scheduler that only
runs inside that same process cannot be the thing that resurrects it.

## 2. Architecture

### 2.1 Entry point: `instrumentation.ts`

- New file `instrumentation.ts` at the project root using Next.js's built-in
  `register()` hook (stable since Next 15, no config flag needed on Next ^16.2.12).
- Guard with `process.env.NEXT_RUNTIME === 'nodejs'` — `register()` is invoked for
  both the `nodejs` and `edge` runtimes; the scheduler must only start once, in the
  Node.js runtime.
- Guard with `process.env.NODE_ENV === 'production'` — the scheduler must **not**
  run under `next dev`, matching current behavior (crontab is only installed on the
  production host; local dev has never had these jobs firing).

### 2.2 Scheduler module

- New module (suggested: `lib/server/cron/registerJobs.ts`) exporting a
  `registerCronJobs()` function called once from `instrumentation.ts`.
- Uses `node-cron` (new dependency: `node-cron` + `@types/node-cron`).
- Schedules, unchanged from the current crontab cadence:
  - `rss-sync`: `5,35 * * * *`
  - `aqi-sync`: `20,50 * * * *`
  - `cwa-sync`: `15,45 * * * *`
  - `earthquakes-sync`: `3,13,23,33,43,53 * * * *`
- No explicit timezone option: all four schedules are relative ("every hour at
  minute N"), so timezone does not affect correctness — the system default is fine.

### 2.3 Direct function calls (no HTTP, no secret headers)

Each job calls its existing underlying function directly, in-process:

- `runRssIngestion("internal-cron")` (from `lib/server/rss/runIngestion`)
- the `aqi-sync` equivalent ingestion function
- `runCwaSync()` (from `lib/server/cwa/runSync`)
- the `earthquakes-sync` equivalent function

This removes the HTTP loopback hop and the `x-rss-sync-secret` /
`x-rss-sync-admin-secret` check for these four calls — there is no longer an
external caller to authenticate against, since the trigger now lives inside the
same process as the code it's calling.

### 2.4 Overlap guard

Each job gets a simple in-memory running flag (per job) so that if a sync takes
longer than its interval, the next scheduled tick skips instead of running
concurrently. This addresses a pre-existing latent risk: today's `curl --max-time`
only abandons the *client* side of the request: the server-side handler (e.g.
`cwa-sync`'s fire-and-forget `runCwaSync().then(...)`) can keep running past the
curl timeout, and the next cron tick fires regardless.

```ts
let rssSyncRunning = false;
cron.schedule("5,35 * * * *", async () => {
  if (rssSyncRunning) return;
  rssSyncRunning = true;
  try {
    const summary = await runRssIngestion("internal-cron");
    await appendLog("rss-sync-cron.log", JSON.stringify({ ok: true, summary }));
  } catch (error) {
    await appendLog("rss-sync-cron.log", JSON.stringify({ ok: false, error: String(error) }));
  } finally {
    rssSyncRunning = false;
  }
});
```

### 2.5 Logging

Preserve the existing per-job log files under
`/home/tw123457/health_app/logs/{job}-cron.log` (matches current operational
habit of `tail -f` on a specific job's log). Each job's callback appends a
JSON-summary line to its existing log file path (same paths currently written by
the crontab's `curl ... >> logs/{job}-cron.log 2>&1` redirection).

## 3. Removed surface

- `app/api/internal/rss-sync/route.ts` and `app/api/internal/aqi-sync/route.ts` —
  deleted (no longer called by anything; `cwa-sync` and `earthquakes-sync` never
  had an `/internal` variant to begin with).
- `requireInternalSecret` in `lib/server/config/adminAuth.ts` — deleted (its only
  callers were the two routes above).
- `env.rssSyncSecret` / `RSS_SYNC_SECRET` — removed from `lib/server/config/env.ts`
  and `.env.example`.
- `requireAdminSecret` / `RSS_SYNC_ADMIN_SECRET` are **not** touched — still used by
  `/api/admin/cwa-sync`, `/api/admin/earthquakes-sync`, `/api/admin/news-images`,
  and other admin-only routes called externally (GitHub Actions, backfill scripts).

## 4. Deploy-side changes

- `scripts/health-app.crontab`: trim to the single `pm2-ensure-running` line; keep
  the existing BEGIN/END managed-block format (it exists to avoid clobbering the
  other two apps' lines on this shared cPanel account, which is still true with
  one line).
- `scripts/deploy-crontab.sh`: drop the `RSS_SYNC_SECRET` / `RSS_SYNC_ADMIN_SECRET`
  required-env checks and `sed` substitutions; keep `OPS_KEY`.
- `.github/workflows/deploy-ftps.yml` — "Sync scheduled-task crontab" step
  (currently lines ~319-335): drop `RSS_SYNC_SECRET` / `RSS_SYNC_ADMIN_SECRET` from
  its `env:` block.
- `RSS_SYNC_SECRET` GitHub Actions secret itself is left defined but unused
  (cleanup deferred, out of scope for this change).

## 5. Verification & compliance

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — 0 build errors.
- `npm run lint` — 0 errors.
- Manual: confirm `instrumentation.ts` does not register jobs when running
  `next dev` locally (check for absence of job logs / no scheduler console output).
- Manual (post-deploy): confirm the four sync log files continue to receive
  entries on their expected cadence, and that `crontab -l` on the host now shows
  only the single `pm2-ensure-running` line for this app's managed block.
