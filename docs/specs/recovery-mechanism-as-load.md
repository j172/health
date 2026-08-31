# Spec & Ticket: Three Ways the Recovery Mechanism Becomes the Load

- **Ticket ID**: `SPEC-HEALTH-20260831-RECOVERY-LOAD`
- **Priority**: HIGH (P1)
- **Affects**: `.remote-health-index.php`
- **Closes/advances**: #97 (liveness test), #98 (ceiling), and the probe-budget item filed in #97's body

---

## 1. Why these three together

All three are the same defect wearing different clothes: **something built to recover the site consumes the resource the site needs to recover.** They live in one file, each is small, and each is now backed by a number that only became available after the 2026-08-31 13:45 deploy put diagnostics in production. Fixing them separately means three PM2 restarts to ship three small edits.

---

## 2. The three

### 2.1 The liveness test counts a zombie as alive (#97)

`killPrebuiltRun` ends with:

```php
usleep(300000);
return !is_dir("/proc/{$pid}");
```

`/proc/<pid>` persists for a process that has been killed but not yet reaped. `is_dir` is true for it, so a **successful** kill reports failure.

Both earlier hypotheses about #74 are now dead. The deployed diagnostics say:

```
extension_loaded('posix')     = true
function_exists('posix_kill') = true
ini_get('disable_functions')  = ''
kill mechanism in use         = posix_kill (forkless)
```

`posix_kill` was callable all along. And support's process list, taken later in the 2026-08-31 outage, contains 639986 but **not** 611802 — the pid `apply-prebuilt-force` had just refused to act on, saying it "could not be killed". It had been killed.

That is worse than the failure this was opened for: **the account could recover and the code declared it could not**, so `force` correctly declined to spawn a replacement and the outage continued.

**Fix:** read `/proc/<pid>/stat` and treat state `Z` as dead. Field 3 is the state character, and the executable name in field 2 can contain spaces and parentheses, so parse after the **last** `)`. Re-check with a short backoff rather than one fixed sleep, and put the observed state into the refusal message so the next incident needs no reconstruction.

### 2.2 The escalation ceiling is ten times the real baseline (#98)

The gate shipped with a ceiling of 70 against NPROC 100, sized on an estimated steady state of 25–40. The first production reading was:

```
process_count = 7   ceiling = 70   nproc_limit = 100   blocking = no

1449687  lsphp
1449721  PM2 God Daemon
1449746  pm2-logrotate
1452121  next-server (v16.3.0)    ← bid-web
1682033  next-server (v16.2.12)   ← health-web
```

**Seven.** A ceiling of 70 lets the account reach ten times its healthy size before declining to spawn.

**Fix:** re-derive the ceiling from the measured baseline. It must stay high enough for one permitted escalation to finish — roughly 5 pm2 spawns plus an apply-prebuilt run — so it cannot sit just above 7. State the new number and the arithmetic. Keep it a named constant with the measurement in a comment, so the next person changing it knows what it was derived from.

### 2.3 The health probe spends 25 minutes forking at an app that cannot start

Inside the apply script:

```sh
for ATTEMPT in $(seq 1 150); do
  curl -fsS --max-time 10 http://127.0.0.1:3000/news >/dev/null 2>&1 && \
  curl -fsS --max-time 10 http://127.0.0.1:3000/news/60 >/dev/null 2>&1 && { PROBE_OK=1; break; }
  sleep 1
done
```

When the app comes up this costs a couple of seconds. When it cannot, each attempt is two `curl` forks against a refused port, up to 150 times — **~25 minutes of forking on an account whose problem is that it cannot fork.** The `pm2-ensure-running` watchdog escalates every 5 minutes, so several of these overlap.

`.apply-prebuilt-fail-count` already persists across runs and is currently read only to decide whether to send an ntfy alert. It should also shrink this budget: a first attempt after a healthy period deserves the full 150; the fourth consecutive failure does not.

**Fix:** scale the probe budget by the recorded consecutive-failure count. State the schedule chosen and why.

---

## 3. Explicit Non-Goals

- Do **not** flip the straggler reaper from observe-only to apply. That waits for one real incident's log to be checked against what it would have killed — the decision recorded on #98.
- Do **not** change apply-prebuilt's unpack, validation, swap or rollback. It works, and it is the most dangerous code in the repo.
- Do **not** re-enable `news-og-backfill`. Its per-run host cost has still not been measured.
- Do not touch application code.

---

## 4. Verification

- `php -l` via CI (`.github/workflows/php-lint.yml`). **There is no local PHP in this project and no PHP test setup** — say plainly what is and is not covered rather than implying more.
- For the zombie fix: state how the `/proc/<pid>/stat` parse handles an executable name containing spaces or `)`.
- For the ceiling: show the arithmetic from the measured baseline of 7 and the cost of one permitted escalation.
- For the probe: state the budget schedule and what a fourth consecutive failure now costs in forks versus today's 300.
- After deploy, paste `/__ops/pm2-status` showing the new ceiling and the process count.
