# SPEC-HEALTH-20260913-NO-SERVER-FETCH-REGRESSION-GUARD

## 1. Context & Incident Report (Issue #114)
- **Problem**: Cloudflare 502 Bad Gateway errors observed on server-rendered news pages (e.g. `/news/940829`).
- **Root Cause**: The shared cPanel host enforces strict virtual memory limits (`ulimit -v`). Node.js 18/20's global `fetch()` implementation (`undici`) lazily compiles a WebAssembly-based llhttp parser via `WebAssembly.instantiate()`. Under virtual memory pressure, `WebAssembly.instantiate()` throws an unhandled `RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance`, abruptly crashing the Next.js worker process.
- **Repository Standard**: As established in `lib/server/net/httpClient.ts`, all server-side HTTP networking must utilize native `node:http`/`node:https` clients (`httpRequest` / `httpGetText`), which use Node.js's native C++ llhttp parser and allocate no WebAssembly virtual memory.

## 2. Regression Guard Design
- To ensure no developer or future automation inadvertently introduces global `fetch()` in server-side execution paths, an automated regression test is placed in `tests/no-server-fetch.test.mjs`.
- **Scanning Scope**:
  - `lib/server/**/*.ts` (all server-side modules, cron jobs, DB operations, ingestors).
  - `app/api/**/route.ts` (all Next.js route handlers).
- **Detection Logic**:
  - Automatically strips line comments (`// ...`) and block comments (`/* ... */`).
  - Ignores string literals.
  - Matches global invocations of `fetch(...)` using regex `(?<![.\w])fetch\s*\(`.
  - Explicitly permits member method calls such as `source.fetch()`.
- **Enforcement**:
  - Runs in `npm test` as part of CI/CD pre-merge and deployment checks.

## 3. Verification Strategy
- `node --test tests/no-server-fetch.test.mjs` verifying clean pass across all server files.
- Full regression test run `npm test` (all 201 tests passing).
- `npm run typecheck` (0 errors).
