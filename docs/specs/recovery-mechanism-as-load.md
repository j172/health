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

### 2.2 Process leaders undercount NPROC task use (#98)

The gate shipped with a ceiling of 70 against NPROC 100, sized on an estimated steady state of 25–40. The first production reading was:

```
process_count = 7   ceiling = 70   nproc_limit = 100   blocking = no

1449687  lsphp
1449721  PM2 God Daemon
1449746  pm2-logrotate
1452121  next-server (v16.3.0)    ← bid-web
1682033  next-server (v16.2.12)   ← health-web
```

**Seven process leaders** was the first healthy production snapshot. Later, during the 2026-10-07 investigation, an account sample had 8 leaders but 52 threads. The incident had 31 leaders, still below the old 35-process threshold, while PM2/Node logged `pthread_create` and `uv_thread_create` failures. The precise provider-side limiter (NPROC, LVE, memory, or another host constraint) cannot be proved from those logs alone, but process-leader count was not a reliable proxy for the resource that failed.

**Fix:** the gate sums `Threads` from account-owned `/proc/<pid>/status` files, without forking. The threshold is 65 tasks: the confirmed NPROC limit of 100 minus a 35-task allowance for one bounded PM2 CLI/daemon, replacement Node app, and transient recovery work plus slack. Unknown measurements fail closed. A shared lock serializes watchdogs and PM2 operations; failed starts back off instead of rebuilding PM2 on every overlapping tick. The per-request self-heal path also has a nonblocking lock and a five-minute cooldown, preventing every failed visitor request from launching another watchdog curl.

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

`.apply-prebuilt-fail-count` persists across runs (reset to 0 on success, incremented on failure) and also shrinks this budget: a first attempt after a healthy period gets the full 150; repeated failures get less.

**Fix:** the schedule is 150 / 100 / 60 / 30 attempts for 0 / 1 / 2 / 3+ prior failures. Thus, the fourth attempt (after three prior failures) permits 60 curl forks rather than 300, an 80% reduction. Recovery attempts also use a 5 / 10 / 20 / 40 / 60 minute capped backoff.

---

## 3. Explicit Non-Goals

- Do **not** flip the straggler reaper from observe-only to apply. That waits for one real incident's log to be checked against what it would have killed — the decision recorded on #98.
- Do **not** change apply-prebuilt's unpack, validation, swap or rollback. It works, and it is the most dangerous code in the repo.
- Do **not** re-enable `news-og-backfill`. Its per-run host cost has still not been measured.
- Do not touch application code.

---

## 4. Verification

- Local `php -l` and focused regression tests pass; CI runs both lint and the recovery tests (`.github/workflows/php-lint.yml`).
- For the zombie fix: state how the `/proc/<pid>/stat` parse handles an executable name containing spaces or `)`.
- The zombie parser reads after the last `)`, so spaces or parentheses inside the executable name do not shift the state field.
- The task ceiling is 65 = 100 NPROC tasks - 35 reserved recovery tasks; the measured healthy sample was 52 tasks.
- After deployment, cache-busted direct-origin verification reported both sites HTTP 200, local ports 3000 and 3300 HTTP 200, process leaders 9, tasks 53, ceiling 65, NPROC 100, gate open, `posix_kill` available, and zero reaper candidates (an earlier idle sample was 8/52).
- The watchdog endpoint confirmed both applications online and reported that it spawned no process. Public CDN responses also returned HTTP 200; direct-origin checks were used to avoid stale cached maintenance output.
- Authenticated `/__ops/*` responses now include `Cache-Control: private, no-store, max-age=0`; the public edge returned `CF-Cache-Status: BYPASS`.
