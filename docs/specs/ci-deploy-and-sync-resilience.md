# SPEC-HEALTH-20260913-CI-DEPLOY-AND-SYNC-RESILIENCE

## 1. Context & Motivation
- **Issue #229**: During production deploys (`.github/workflows/deploy-ftps.yml`), step `Purge Cloudflare cache` fails with `curl: (22) The requested URL returned error: 401`. Because this step lacked `continue-on-error: true` and executed with `set -euo pipefail`, any token revocation or permission glitch on `CLOUDFLARE_API_TOKEN` aborts the workflow. This caused 20+ critical downstream steps (crontab sync, news image backfills, verification checks, and open-data ingestion tasks) to be skipped.
- **Issue #224**: In `.github/workflows/six-monthly-sync.yml`, calling admin sync APIs relied on an `ssh -N -L 18080:127.0.0.1:3000` tunnel. However, the production host (HawkHost) disabled TCP port forwarding (`AllowTcpForwarding no`), causing the tunnel to fail with `administratively prohibited`. Direct requests to `https://health.j172.tw` are blocked by Cloudflare's bot-detection JS challenge (HTTP 403).

## 2. Architecture & Design

### 2.1 Cloudflare Cache Purge Fault Tolerance (#229)
- In `.github/workflows/deploy-ftps.yml`:
  - Step `Purge Cloudflare cache` is marked with `continue-on-error: true`.
  - The curl execution captures HTTP response status and body without using `--fail`.
  - If the status is 200, the output is parsed as JSON.
  - If the status is non-200 (e.g. 401 Unauthorized), the step logs a GitHub Actions annotation `::warning::Cloudflare cache purge failed with HTTP ...` and exits with code 0.
  - This ensures cache purge failures never abort crontab sync or subsequent open data ingestions.

### 2.2 Application-Layer SSH Loopback Bridge (#224)
- Rather than modifying 10+ distinct node and bash scripts to use custom SSH transports, a transparent local bridge server (`scripts/lib/ssh-bridge.mjs`) is introduced.
- **Runner-Side HTTP Server**:
  - Listens on `127.0.0.1:18080` (or `PORT` env var).
  - Handles `GET /healthz` immediately with HTTP 200 `{"ok":true,"bridge":true}`.
  - For all other requests:
    - Extracts HTTP method, URL path + query, headers, and body.
    - Uses `createSshLoopback` (SSH ControlMaster multiplexer) to invoke `curl -sS --max-time 180 -X $METHOD http://127.0.0.1:3000$PATH` on the production server.
    - Streams request body over stdin to curl (`--data-binary @-`).
    - Returns the remote response HTTP status, headers, and body directly to the local client.
- **Workflow Lifecycle**:
  - Staging deploy key via `scripts/lib/ssh-key-stage.sh`.
  - Launching `node scripts/lib/ssh-bridge.mjs &` and saving PID.
  - Polling `/healthz` until ready.
  - End-to-end probing via `http://127.0.0.1:18080/api/aqi`.
  - Cleaning up PID and staged SSH key in an `if: always()` step.
- All existing scripts (`run-six-monthly-sync.sh`, `import-tfda-food-nutrition.mjs`, `import-tfda-food-operators.mjs`, `submitFacilities`, etc.) continue using `HEALTH_BASE_URL: http://127.0.0.1:18080` without modifying a single line of data transformation code.

## 3. Verification Strategy
1. Automated unit test `tests/ssh-bridge.test.mjs` verifying `/healthz` and mock forwarding.
2. Full test suite verification (`npm test`, `npm run typecheck`).
3. Live CI deploy check: verify `Purge Cloudflare cache` warns cleanly without killing deploy.
4. Live dispatch check: trigger `six-monthly-sync.yml -f type=heritage` to verify SSH bridge connectivity and execution.
