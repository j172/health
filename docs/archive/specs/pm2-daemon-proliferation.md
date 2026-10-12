# Spec & Ticket: Stop pm2 Daemon Proliferation Exhausting NPROC

- **Ticket ID**: `SPEC-HEALTH-20260831-PM2-PROLIFERATION`
- **Status**: Implemented and verified in production (2026-10-07)
- **Priority**: HIGH (P1)
- **Affects**: `.remote-health-index.php`

---

## 1. Problem Statement

Hosting support supplied the process list during the 2026-08-31 outage (~4h39m). It names a root cause that survived two earlier incidents because each was diagnosed as *one stuck script* rather than as what filled the process table.

```
609811, 609979, 611786, 649558, 650378, 806131   six Daemon.js
608229, 612089, 640869, 822414                   four ProcessContainerFork.js
611889, 640678, 641499                           three `pm2 start ecosystem.config.cjs`
639961, 639986                                   two apply-prebuilt shells, same minute
2493175  node /bin/timeout update   Aug29        an orphan two days old
```

**The account's NPROC limit is 100** (hosting support, in writing — earlier notes guessing "20 Entry Processes" are wrong; EP and NPROC are different CloudLinux limits and it is NPROC that blows).

### The mechanism

`pm2-ensure-running` runs from cron every 5 minutes. Its healthy path is already fork-free — an `fsockopen` probe on port 3000, added 2026-08-23 for exactly this reason. **The failure path is not.** One failed escalation spawns five processes:

```php
exec('timeout 5 ' . $pm2Bin . ' jlist ...');      // 1
// if the daemon is unresponsive:
exec('timeout 5 ' . $pm2Bin . ' kill ...');       // 2
exec('pkill -9 -f "PM2 v" ...');                  // 3
@unlink(pm2.pid); @unlink(rpc.sock); @unlink(pub.sock);
exec('timeout 20 ' . $pm2Bin . ' resurrect ...'); // 4  ← starts a NEW daemon
exec('timeout 5 ' . $pm2Bin . ' jlist ...');      // 5
```

Every `pm2` CLI call that cannot reach the live daemon starts another one. Over a 4h39m outage that is roughly **56 escalations × 5 spawns**. The daemons then hold the slots the next escalation needs, so the next one fails too — the recovery mechanism is the load.

### This is the third occurrence

`ops_health_502_watchdog` records 2026-08-23 as "the account filled up with idle pm2 helpers" and 2026-08-29 as "a stuck apply-prebuilt needing a support ticket". Both were the same accumulation seen from a different angle.

### Why the existing fixes did not prevent it

- **#74 (`posix_kill`)** clears *one* wedged script. Even working, it would not stop daemons accumulating — and it did not work (see #97).
- **#75 (deploy fails fast on SSH reset)** worked: this deploy stopped after 22 seconds instead of polling 90 times over 11 minutes. That is damage limitation, not prevention.

---

## 2. Agreed Architectural Blueprint

### 2.1 Gate escalation on Linux task use, not only process leaders

Before any escalation that spawns a process, scan account-owned `/proc/<pid>/status` files and sum each process's `Threads` count. This reads `/proc` directly and needs no fork. The 2026-10-07 incident had 31 process leaders, below the old 35-process threshold, while PM2/Node logs reported `pthread_create` / `uv_thread_create` failures. A later healthy-host sample showed 8 process leaders but 52 threads, confirming that process leaders alone understate the constrained task use.

The configured task ceiling is 65 against the hosting-support-confirmed NPROC limit of 100: 35 slots are reserved for one bounded PM2 CLI/daemon, replacement Node app, wrapper/probe work, and slack. At 65 or above, or whenever a trustworthy task count cannot be read, **do not spawn**. The gate reopens automatically when task use falls below 65; it is not a fixed failure-count shutdown.

### 2.2 Make the refusal observable

The watchdog log and `/__ops/pm2-status` state process leaders, summed tasks, the task ceiling, NPROC limit, and whether recovery is blocked. Unknown measurements fail closed. The watchdog uses one shared PM2 lock, bounded `startOrRestart` calls, and exponential retry backoff; it probes health and mall independently so either can be restored. The per-request self-heal path is separately locked and throttled to one trigger per five minutes. A failed lock acquisition also refuses to spawn.

### 2.3 Report the diagnostic facts #97 needs

`/__ops/pm2-status` reports `extension_loaded('posix')`, `function_exists('posix_kill')`, and `ini_get('disable_functions')`. Production verification reports `true`, `true`, and an empty disabled-functions list; the reaper uses forkless `posix_kill`.

### 2.4 Close the double-spawn race

Two `apply-prebuilt` shells started in the same minute despite `triggerPrebuiltRun` holding an `flock()` across check → kill → spawn. `exec()` returns as soon as `nohup … &` backgrounds the script, and the lock releases — but the script only writes `.apply-prebuilt.pid` once it begins running. A second request arriving in that window sees no pid, concludes nothing is running, and spawns another.

The lock must not release until the new run's pid is observable.

### 2.5 Reap stragglers

The reaper remains dry-run/observe-only in the watchdog. It only signals positively identified stale candidates when explicitly invoked with `apply=1`. Post-deploy verification found one live PM2 God daemon and zero reaper candidates, so no process was killed speculatively.

---

## 3. Explicit Non-Goals

- Do **not** add a "stop escalating after N consecutive failures" cap. Considered and rejected: it abandons a recoverable app whose process table is fine, and there is no evidence of the runaway-without-exhaustion case — all three incidents were NPROC exhaustion.
- Do **not** change `apply-prebuilt`'s unpack, validation, swap or rollback logic. It works.
- Do **not** re-enable `facilities-geocode-batch` or `news-og-backfill`. Whether they are cause or casualty is unestablished — the geocode batch's first failure at 23:51 coincides exactly with the app going down.
- Do not touch any application code.

---

## 4. Verification & Quality Assurance

- `php -l` passes — CI enforces it (`.github/workflows/php-lint.yml`).
- `tests/pm2-recovery-guard.test.php` covers lock exclusion, retry backoff, task summation/unknown-count behavior, and forkless log-tail boundaries; `tests/pm2-watchdog-contract.test.php` locks down the front-controller integration.
- The production task scan reads `/proc` directly; it does not call `ps`, `wc`, or other subprocesses.
- Production verification on 2026-10-07: health and mall both returned HTTP 200 directly from the origin; local ports 3000 and 3300 returned HTTP 200; `/__ops/pm2-status` reported 9 process leaders, 53 tasks, task ceiling 65, NPROC 100, and `blocking=no` (an earlier idle sample was 8/52). `posix`/`posix_kill` were available, with no disabled functions. The reaper dry run identified God daemon PID 3138410 and found 0 candidates.
- A cached public maintenance response initially showed pre-deploy values. All `/__ops/*` responses now send `Cache-Control: private, no-store, max-age=0`; the edge reported `CF-Cache-Status: BYPASS`, and direct-origin checks were used for authoritative verification.
