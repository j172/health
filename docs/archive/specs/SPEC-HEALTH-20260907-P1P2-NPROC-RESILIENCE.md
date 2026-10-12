# Spec & Ticket: Elimination of Server-Side npm-ci and Host NPROC Cascade (P1 & P2)

- **Ticket ID**: `SPEC-HEALTH-20260907-P1P2-NPROC-RESILIENCE`
- **Status**: IMPLEMENTED
- **Priority**: HIGH (P1 / P2)
- **Affects**: 
  - `.github/workflows/deploy-ftps.yml`
  - `.github/workflows/facilities-geocode-batch.yml`
  - `scripts/gha-facilities-geocode-batch.mjs`
  - `.github/workflows/news-og-backfill.yml`
  - `scripts/gha-og-external-backfill.mjs`
- **Related Incidents**:
  - 2026-08-23 (pm2 helper pileup)
  - 2026-08-29 (stuck apply-prebuilt wrapper)
  - 2026-08-31 (`SPEC-HEALTH-20260831-PM2-PROLIFERATION`, `SPEC-HEALTH-20260831-RECOVERY-LOAD`)
  - 2026-09-07 (LiteSpeed 503 outage during GHA deploy Run #34109299956)

---

## 1. Incident Diagnosis (2026-09-07 10:02 - 10:25 UTC)

During deployment run `#34109299956`, the host failed at step `Trigger node_modules sync on server`:
```text
/etc/bashrc: fork: retry: Resource temporarily unavailable
```
The account reached its CloudLinux LVE limits (`NPROC = 100`, `Entry Processes = 20`).

### The Cascading Failure Mechanisms:
1. **Unnecessary Server-Side Execution on Code-Only Deploys**:
   Even when `package.json` and `package-lock.json` are completely unchanged, `deploy-ftps.yml` still executed `Trigger node_modules sync on server` over SSH, triggering `(nohup bash server-npm-ci.sh ...)`. This forked bash, ran `node -e` dependency inspection, and consumed process slots.
2. **The 90-Attempt (12+ Minute) Polling Storm**:
   `Wait for node_modules sync` had:
   ```bash
   REPLY="$(ssh ... || echo 'PENDING|unknown')"
   ```
   When the host dropped SSH connections (`exit 255: Connection closed by remote host`), the catch block returned `PENDING|unknown`. The script treated connection failure as "still installing" and continued polling 90 times every 5 seconds. This flooded the host's 20-slot Entry Process queue and prevented recovery.
3. **Concurrent Background Job Collision**:
   At 10:07 UTC, `facilities-geocode-batch.yml` ran its 10-minute scheduled run while the deploy was struggling. The scheduled job attempted to establish SSH loopback connections, colliding directly with the deploy.
4. **LiteSpeed 503 Denial**:
   Because the account's EP/NPROC slots were saturated, LiteSpeed Web Server could not spawn `lsphp` workers. Within 0.7s, LiteSpeed returned:
   `HTTP 503 Service Unavailable: The server is temporarily busy, try again later!`
   PHP never executed, bypassing all application-level error handlers and watchdog routes.

---

## 2. Technical Blueprint

### P1: Deploy Pipeline & Connection Hardening

1. **Skip Server `node_modules` Sync for Code-Only Deploys**:
   - In GitHub Actions runner: compare `package.json` and `package-lock.json` between the target commit and the base commit (`git diff HEAD~1`).
   - If both files are unchanged, skip `Trigger node_modules sync on server` and `Wait for node_modules sync` completely.
   - For code-only deploys (99% of runs), zero SSH sessions and zero bash processes are spawned on the server for dependencies.
2. **SSH Fail-Fast Guard**:
   - If SSH fails with connection refusal or drop (`exit 255`, `Broken pipe`), track consecutive failures (`SSH_FAIL_COUNT`).
   - If SSH fails 3 consecutive times: terminate immediately with `exit 1` instead of polling 90 times.
3. **Cross-Workflow Server Concurrency (Shared Lock)**:
   - Unify all server-touching workflows under `concurrency: group: host-tw123457-server`.
   - `deploy-ftps.yml`: `cancel-in-progress: false` (deploy runs to completion).
   - Background batch workflows (`facilities-geocode-batch.yml`, `news-og-backfill.yml`): `cancel-in-progress: true` (if a deploy starts, cancel background tasks immediately to release process slots).

### P2: Scheduled Task Decoupling & Resilience

1. **Reduce Facilities Geocode Frequency**:
   - Change `facilities-geocode-batch.yml` cron from `*/10 * * * *` (144 runs/day) to `*/30 * * * *` (or `0 */2 * * *`).
2. **Graceful Degradation on SSH Rejection**:
   - In `scripts/gha-facilities-geocode-batch.mjs` and `scripts/gha-og-external-backfill.mjs`:
     When SSH exits with `255` (Connection closed by remote host / LVE saturated), log a warning and exit cleanly (`exit 0`), rather than aggressively retrying and triggering CI alarms.

---

## 3. Verification Plan

1. Syntax check of all modified YAML and JS files.
2. Run `npm test` and `npm run typecheck` to verify no regressions.
3. Merge to `main`.
4. Trigger `deploy-ftps.yml` and verify:
   - Server `node_modules` sync is skipped cleanly.
   - Deploy completes smoothly in ~2 minutes.
   - Live site `health.j172.tw` remains 200 OK.
