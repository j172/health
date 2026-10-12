# Spec: Fix React 19 Hydration Mismatch #418, In-App Cron Memory Guard (WASM OOM 502), and Static Webmanifest

## 1. Background & Incident Overview
- **Incident Summary**:
  Production visitors on `health.j172.tw` experienced:
  1. `Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]=` in browser console.
  2. A barrage of `Failed to load resource: the server responded with a status of 502 ()` covering:
     - `/_next/image?...` (optimized images)
     - `/manifest.webmanifest`
     - `/api/aqi/nearest?lat=...` (and `/api/uv/nearest`)
     - Multiple route prefetch requests: `/?_rsc=...`, `/tools/weather-alerts?_rsc=...`, `/news/...`, etc.
  3. Preload resource unused warnings triggered by the failed prefetch responses.

---

## 2. Root Cause Analysis

### 2.1 Issue 1: React 19 Hydration Mismatch (`Error #418`)
- **Location**: `app/context/LanguageContext.tsx`
- **Cause**:
  `LanguageProvider` utilizes `useSyncExternalStore(subscribeToStorage, getClientLocale, () => "zh-TW")`.
  During SSR (and on edge cache), the HTML is rendered in Traditional Chinese (`"zh-TW"`).
  On initial client hydration, `getClientLocale()` executes and immediately returns `"en"` if the visitor's browser language is English (`navigator.language.startsWith("en")`) or if `localStorage` has `locale: "en"`.
  During hydration, `t(...)` produces English strings (e.g. "All News", "Trending News") while the server-rendered DOM has Chinese strings (e.g. "全部新聞", "熱門焦點新聞").
  React 19 detects this text mismatch during DOM hydration and throws `Minified React error #418`.

### 2.2 Issue 2: In-App Cron Memory Spikes & WASM OOM 502 Crashes
- **Location**: `lib/server/cron/registerJobs.ts`, `ecosystem.config.cjs`
- **Cause**:
  `health-web` is capped with `--max-old-space-size=768` and `max_memory_restart: '1024M'` in `ecosystem.config.cjs` due to shared cPanel / CloudLinux LVE limits.
  `registerCronJobs()` schedules **25+ recurring cron jobs** inside the same single Node.js process that serves web traffic.
  When multiple jobs execute concurrently or when heavy jobs run, process memory approaches the ceiling. Under CloudLinux `ulimit -v`, `WebAssembly.instantiate()` fails immediately with `RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate Wasm memory for new instance`, causing the Node.js web server to crash.
  While PM2 is restarting the server (or if it enters the `errored` state after rapid restarts), `.remote-health-index.php` cannot connect to `127.0.0.1:3000` via cURL and responds with `HTTP 502 Proxy error`.

### 2.3 Issue 3: Dynamic `/manifest.webmanifest` Failing with 502
- **Location**: `app/manifest.ts`, `.remote-health-index.php`
- **Cause**:
  `manifest.webmanifest` is served by Next.js's dynamic metadata route on `127.0.0.1:3000`.
  Because it has no static bypass in `.remote-health-index.php`, when Node.js is rebooting or under high load, requests for `/manifest.webmanifest` return 502.
  The manifest is completely static and never varies between requests.

---

## 3. Goals & Solutions

### 3.1 Solution 1: LanguageContext Hydration Guard
- Add a `mounted` state inside `LanguageProvider`.
- Prior to mounting (`!mounted`, which encompasses SSR and the initial client hydration pass), `locale` is strictly locked to `"zh-TW"`.
- Once mounted (via `useEffect`), `locale` transitions to `userLocale ?? detectedLocale`.
- This guarantees byte-for-byte text consistency between SSR HTML and hydration virtual DOM, permanently eliminating React Error #418.

### 3.2 Solution 2: Memory Pressure Circuit Breaker for In-App Cron
- Enhance `runGuarded()` in `lib/server/cron/registerJobs.ts`:
  Before launching any of the 25+ background cron tasks, inspect `process.memoryUsage()`.
  If `rss > 620MB` or `heapUsed > 550MB` (approx. 80% of the 768MB budget), immediately **skip** the current execution tick.
  Log a warning entry into `logs/memory-monitor.log` (`event: "skipped_memory_pressure"`).
  This sheds background load, gives V8 room to garbage collect, and keeps `health-web` online and responsive to visitor traffic.

### 3.3 Solution 3: Static PWA Manifest & PHP Fast Bypass
- Create static `public/manifest.webmanifest` matching the contents of `app/manifest.ts`.
- In `.remote-health-index.php`, add a static path bypass for `/manifest.webmanifest` before proxying to port 3000 (similar to `/favicon.ico` and `/images/`).
- Serve with `Content-Type: application/manifest+json; charset=utf-8` and `Cache-Control: public, max-age=86400`.
- Ensures `/manifest.webmanifest` is always served instantly and reliably with 200 OK, even if the Node server is deploying or rebooting.

---

## 4. Verification Plan
- Unit tests:
  - `tests/language-hydration.test.mjs` verifying LanguageProvider initial pass behavior.
  - `tests/cron-memory-guard.test.mjs` verifying `runGuarded` memory pressure guard.
- Typecheck: `npm run typecheck` passes with 0 errors.
- Build: `npm run build` succeeds without issues.
- Git PR & Merge -> Automatic deployment via `deploy-ftps.yml`.
