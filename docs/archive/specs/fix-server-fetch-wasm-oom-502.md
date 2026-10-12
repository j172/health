# Spec: Fix 502 Bad Gateway from Server-Side fetch() WebAssembly OOM

## Background & Incident Report
- **URL**: `https://health.j172.tw/news/940829` (and recently inserted news articles).
- **Symptom**: Cloudflare Error Code 502 Bad Gateway when visiting the page.
- **Root Cause Discovered in PM2 Logs** (`/home/tw123457/.pm2/logs/health-web-error-2.log`):
  ```text
  RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance
      at ignore-listed frames
  RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance
      at ignore-listed frames
  ```
- **Technical Analysis**:
  - The shared cPanel / CloudLinux host operates under a strict virtual memory cap (`ulimit -v`).
  - In Node.js 18/20, global `fetch()` is provided by `undici`, which lazily instantiates a WASM-based llhttp parser on first request via `WebAssembly.instantiate()`.
  - When memory pressure occurs or under CloudLinux LVE memory limits, `WebAssembly.instantiate()` fails immediately with `RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance`.
  - In PR #111, `submitToIndexNow` was introduced using global `fetch("https://api.indexnow.org/indexnow", ...)`.
  - At the end of RSS ingestion (`runIngestion.ts`), newly inserted articles (e.g. article `940829`) trigger `submitToIndexNow(newUrls)`.
  - When `fetch()` was executed, `undici` failed to allocate WASM memory, throwing the unhandled RangeError and crashing the Next.js process (`health-web`).
  - Incoming requests to `/news/940829` then failed with 502 Bad Gateway until PM2 auto-restarted or the watchdog intervened.
  - The repository's established standard (documented in `lib/server/net/httpClient.ts`, `lib/server/cwa/client.ts`, `lib/server/aqi/fetchAqi.ts`, and `lib/server/cloudflare/aiClient.ts`) explicitly states that global `fetch()` must NEVER be used on the server, and `httpRequest` / `httpGetText` (backed by native `node:http`/`node:https` and native non-WASM llhttp) must be used instead.
  - Furthermore, residual `fetch()` calls in `lib/server/greenProducts/ingestGreenProducts.ts` and `lib/server/facilities/sources/moenvGreenHotels.ts` also risk triggering the same crash.

## Goals
1. Replace all server-side calls to global `fetch()` in `lib/server/seo/indexnow.ts`, `lib/server/greenProducts/ingestGreenProducts.ts`, and `lib/server/facilities/sources/moenvGreenHotels.ts` with `httpRequest` / `httpGetText` from `@/lib/server/net/httpClient`.
2. Add an automated regression test (`tests/no-server-fetch.test.mjs`) that inspects all files under `lib/server/**/*.ts` and asserts that no server file invokes global `fetch(`, permanently preventing future regressions.
3. Verify typecheck, test suites, and build pass cleanly.
4. Deliver via standard process: Ticket -> Branch -> PR -> Merge -> Deploy -> Live Verification.

## Detailed Changes

### 1. `lib/server/seo/indexnow.ts`
- Replace `fetch("https://api.indexnow.org/indexnow", ...)` with `httpRequest("https://api.indexnow.org/indexnow", ...)`.
- Check `response.status >= 200 && response.status < 300 || response.status === 202`.
- Extract response text safely from `response.buffer.toString("utf-8")`.

### 2. `lib/server/greenProducts/ingestGreenProducts.ts`
- Replace `fetch(url)` with `httpGetText(url)`.
- Parse response text with `JSON.parse(text)`.

### 3. `lib/server/facilities/sources/moenvGreenHotels.ts`
- Replace `fetch(url)` with `httpGetText(url)`.
- Parse response text with `JSON.parse(text)`.

### 4. `tests/no-server-fetch.test.mjs`
- Test that walks `lib/server/**/*.ts` and enforces zero calls to `fetch(`.

## Verification Plan
- `npm test`: All 125+ tests pass including the new server fetch ban test.
- `npm run typecheck`: 0 TypeScript errors.
- `npm run build`: Production build completes without issues.
- GitHub Actions deploy: `deploy-ftps.yml` completes successfully.
- Live HTTP verification: `curl -sI https://health.j172.tw/news/940829` returns HTTP 200 OK.
