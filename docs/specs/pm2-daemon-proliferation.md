# Spec & Ticket: Stop pm2 Daemon Proliferation Exhausting NPROC

- **Ticket ID**: `SPEC-HEALTH-20260831-PM2-PROLIFERATION`
- **Status**: TODO
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

### 2.1 Gate escalation on the process count, not on a failure count

Before any escalation that spawns a process, count the account's own processes by reading `/proc` — a directory listing, which needs no fork and therefore works in exactly the conditions that matter. If the count is at or above a headroom threshold below NPROC=100, **do not spawn**. Log the refusal with the observed count.

**This is deliberately not a "give up after N failures" rule.** Escalation resumes on its own as soon as the count drops. The gate fires only when spawning is both futile and harmful; it never abandons a recoverable app whose process table is healthy.

### 2.2 Make the refusal observable

The watchdog log and `/__ops/pm2-status` must state the process count and whether the gate is currently blocking. A recovery path whose availability cannot be observed is one that cannot be trusted — the lesson from #97, where a silent `exec()` fallback made #74 a no-op for two days without anyone knowing.

### 2.3 Report the diagnostic facts #97 needs

While in this file, have `/__ops/pm2-status` print `extension_loaded('posix')`, `function_exists('posix_kill')` and `ini_get('disable_functions')`. Support confirmed ext-posix is enabled, so the working hypothesis is that `posix_kill` is in `disable_functions` — but that is a hypothesis, and this settles it in one request.

### 2.4 Close the double-spawn race

Two `apply-prebuilt` shells started in the same minute despite `triggerPrebuiltRun` holding an `flock()` across check → kill → spawn. `exec()` returns as soon as `nohup … &` backgrounds the script, and the lock releases — but the script only writes `.apply-prebuilt.pid` once it begins running. A second request arriving in that window sees no pid, concludes nothing is running, and spawns another.

The lock must not release until the new run's pid is observable.

### 2.5 Reap stragglers

`node /bin/timeout update` had been alive since Aug 29. Nothing reaps orphans. A sweep should remove `Daemon.js` / `ProcessContainerFork.js` processes not owned by the live God Daemon, and anything old that is not the app — using whatever kill mechanism is available (see #97; `exec()` may be all there is).

---

## 3. Explicit Non-Goals

- Do **not** add a "stop escalating after N consecutive failures" cap. Considered and rejected: it abandons a recoverable app whose process table is fine, and there is no evidence of the runaway-without-exhaustion case — all three incidents were NPROC exhaustion.
- Do **not** change `apply-prebuilt`'s unpack, validation, swap or rollback logic. It works.
- Do **not** re-enable `facilities-geocode-batch` or `news-og-backfill`. Whether they are cause or casualty is unestablished — the geocode batch's first failure at 23:51 coincides exactly with the app going down.
- Do not touch any application code.

---

## 4. Verification & Quality Assurance

- `php -l` passes — CI enforces it (`.github/workflows/php-lint.yml`).
- Unit-testing PHP is not set up in this repo; state plainly what is and is not covered by automated checks rather than implying more.
- The process-count reader must be demonstrated to work **without forking**: show the implementation reads `/proc` directly rather than shelling out to `ps` or `wc`.
- State the chosen headroom threshold and the reasoning for that number.
- After deploy, `/__ops/pm2-status` must show the process count, the gate state, and the three posix facts. Paste that output.
