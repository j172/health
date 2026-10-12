# Shared keep-alive Agent in httpClient.ts to stop repeated SecureContext rebuilds

## Context

Three separate `std::bad_alloc` crash incidents on 2026-09-23 (see `docs/memory/ops_health_502_watchdog.md`, issues #395/#396) all shared the exact same native stack trace: a crash inside OpenSSL's `SSL_CTX_add_client_CA` / `node::crypto::SecureContext::AddCACert`, thrown while under memory pressure from many concurrent HTTPS calls.

The circuit-breaker fixes in PR #395/#396 stopped one specific *trigger* (Cloudflare AI calls retrying a doomed request thousands of times per ingestion run once the daily quota died). They measurably worked — crash frequency dropped from ~every 6 minutes to ~once per 62 minutes post-deploy (confirmed via `logs/memory-monitor.log` + `health-web-error-*.log` timestamps). But a fresh crash at 11:23:36 UTC, well after the circuit breaker had correctly skipped the network call (log shows `"...skipping network request"` immediately before the crash), proved the *mechanism* itself was never fixed — only one caller of it was. Any other source of concurrent HTTPS traffic (RSS ingestion hitting dozens of feed hosts, image downloads, open-data API calls) can reproduce the identical crash.

## Root cause

`lib/server/net/httpClient.ts`'s `requestOnce()` called `transport.request(parsed, { ..., ca: TRUSTED_CAS })` — passing a custom `ca` array (Node's ~150-cert root store plus 4 project-specific PEMs) **inline on every single request's options object**, with no `agent` specified. Two compounding costs:

1. With no `agent`, Node's default `https.globalAgent` has `keepAlive: false` — every request opens a fresh TCP connection and does a full TLS handshake, then tears the socket down. No reuse across repeated calls to the same host.
2. Passing a custom `ca` array (rather than relying on the default trust store) means Node can't just reuse a pre-built default `SecureContext` — it constructs a brand new `tls.SecureContext` from all ~170 certs, via `SSL_CTX_add_client_CA`, for that one request.

Under light, sequential traffic this is wasteful but survivable. Under load — many ingestion sources fetched in quick succession, or (as in the earlier incidents) hundreds of retried AI calls — many of these expensive rebuilds happen concurrently, and enough of them at once is what exhausts the process's native heap and throws `std::bad_alloc`, independent of the V8 JS heap cap.

## Fix

Two module-level shared `Agent` instances (one `https.Agent`, one `http.Agent`), both `keepAlive: true`. The `ca: TRUSTED_CAS` list moves from being a per-request option to being a construction option of the shared `https.Agent` — built once when the module loads, not once per call. `maxSockets: 50` caps concurrent connections *to a single host* through this agent (it doesn't limit total cross-host concurrency, which remains each caller's own responsibility, same as before).

`requestOnce()` now passes `agent: <the shared instance>` instead of `ca: TRUSTED_CAS` on each call.

## Verification

- `npx tsc --noEmit`, `npx eslint lib/server/net/httpClient.ts` — clean.
- `npm test` — 375/375 (no direct network-mocked tests exist for this module; it's exercised indirectly by every caller's own tests).
- Live verification (standalone script, same Agent construction pattern, run outside the Next.js/`server-only` module boundary that blocks a direct import): three real HTTPS requests — one to a Ministry of Education RSS feed, one to a different host (health.j172.tw), and a repeat of the first — all completed with correct status/byte counts, and the agent's `freeSockets` pool held 2 kept-alive connections afterward, confirming reuse is actually happening rather than being silently bypassed.

## Out of scope

- Not changing `maxResponseBytes`/timeout/redirect-following behavior — unrelated to this fix.
- Not adding per-host connection metrics/observability beyond what `logs/memory-monitor.log` (#399/PR #400) already provides — if this doesn't fully resolve the remaining crash rate, that log is the next place to look.
