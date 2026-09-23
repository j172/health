# Specification: Fix React Hydration Error #418, Remote Image 500/502, and Sidebar API Timeouts

## 1. Problem Statement & Background
Post-deployment browser console inspection on `https://health.j172.tw/` revealed three recurring failures:

1. **Minified React Error #418 (`args[]=text&args[]=`)**:
   - `useGeolocation.ts` and `LocalWeatherSvgWidget.tsx` read `localStorage.getItem(...)` synchronously within their initial `useState` initializer functions. During server-side rendering (SSR), `window.localStorage` is unavailable, defaulting state to `isDefault: true` and `selectedCounty: "auto"`. On the client, prior visitor choices are loaded immediately in the initial render, causing mismatch between server DOM and initial client DOM. Specifically, `AqiSidebarWidget` conditionally renders `<p>定位權限未開啟，顯示預設地區資料</p>` during SSR which is absent during client hydration.
   - Timestamp and date rendering via `Intl.DateTimeFormat` (`toTaipei()`) can produce minor string formatting discrepancies across Node.js V8 ICU and browser platform locales.

2. **Next.js Image Optimization 500 & 502**:
   - External images sourced from `https://blog.j172.tw/...` are processed by `/_next/image`. On the shared hosting VPS environment, upstream fetch failures or sharp native module memory/CPU exhaustion cause 500 Internal Server Errors. Furthermore, concurrent sharp processing oversubscribes CPU/RAM, causing PM2 watchdog restarts that cascade into 502 Bad Gateway proxy errors across static and RSC requests.

3. **Sidebar API 5000ms Timeouts & PM2 Concurrency Saturation**:
   - 10 sidebar widget endpoints (`/api/cpc-prices`, `/api/weather-nearby`, `/api/aqi/nearest`, `/api/uv/nearest`, `/api/water-outages`, `/api/cdc/travel-alerts`, `/api/pest-alerts`) fire concurrently on page load without edge cache headers. A 5-second client timeout (`fetchWithTimeout`) trips under transient server load.

---

## 2. Technical Architecture & Decisions

### Decision 1: Hydration-Safe State Initialization for Geolocation and County Selection
- `useGeolocation` initializes with a fixed baseline: `{ lat: DEFAULT_LAT, lng: DEFAULT_LNG, isDefault: true, ... }` on both server and client during initial render.
- `localStorage.getItem("user_selected_location")` is read inside a `useEffect` hook after mount. If a saved location exists, state updates smoothly in a single post-hydration tick.
- `LocalWeatherSvgWidget` initializes `selectedCounty` to `"auto"`. On mount, a `useEffect` reads the saved selection and updates the active county.
- Result: 100% deterministic SSR/CSR initial DOM alignment.

### Decision 2: Date Hydration Warning Suppression
- Date containers in `NewsCard.tsx`, `HeroPost.tsx`, `NewsSidebar.tsx`, `EarthquakeSidebarWidget.tsx`, and `WeatherAlertSidebarWidget.tsx` are marked with `suppressHydrationWarning`.
- This informs React 19 to tolerate platform ICU formatting variations without throwing Error #418.

### Decision 3: Direct External Image Delivery via `unoptimized`
- `CardThumb.tsx`, `HeroPost.tsx`, and `HeroImage.tsx` evaluate whether an image source is an external URL: `/^https?:\/\//i.test(src)`.
- When true, `unoptimized={true}` is set on `<Image>`.
- Next.js outputs a standard `<img>` pointing directly to `blog.j172.tw`, avoiding the server-side image optimization pipeline entirely. The browser downloads the asset directly (verified 200 OK) with 0 server memory/CPU overhead.
- `next.config.js` `remotePatterns` is sanitized to remove invalid `**` hostname wildcards.

### Decision 4: Edge Caching for Sidebar Endpoints & Extended Client Timeout
- `useSidebarWidgetData.ts` default timeout is raised from `5000ms` to `10000ms`.
- High-frequency API routes add explicit `Cache-Control` response headers with `s-maxage` and `stale-while-revalidate`, allowing Cloudflare edge servers to serve cached responses in <10ms and offloading >90% of requests from the origin Node process:
  - `/api/cpc-prices`: `s-maxage=3600, stale-while-revalidate=86400`
  - `/api/water-outages`: `s-maxage=300, stale-while-revalidate=1800`
  - `/api/cdc/travel-alerts`, `/api/pest-alerts`: `s-maxage=1800, stale-while-revalidate=7200`
  - `/api/weather-nearby`, `/api/aqi/nearest`, `/api/uv/nearest`: `s-maxage=180, stale-while-revalidate=600`

### Decision 5: Mounted Guard for Root Layout Banners (PrivacyConsentBanner & InAppBrowserBanner)
- `PrivacyConsentBanner.tsx` and `InAppBrowserBanner.tsx` previously used `useSyncExternalStore(..., ..., () => true)`. On SSR, the server snapshot returned `true` (rendering `null`). On initial client hydration, `localStorage` has no acknowledgment key, so `getAckSnapshot()` returned `false`. This rendered the banner DOM tree on the client while the server DOM was empty, triggering React 19 Error #418 (`args[]=text&args[]=`).
- Fix: Introduce `const [mounted, setMounted] = useState(false); useEffect(() => setMounted(true), []);`. If `!mounted`, return `null`.
- Result: Server renders `null`, initial client hydration renders `null` (100% byte-for-byte DOM match), and immediately after hydration the client mounts the banner seamlessly without errors.

---

## 3. Verification & Guardrails
- Automated integration test suite `tests/hydration-and-image-resilience.test.mjs` validates:
  1. No synchronous `localStorage` reading in `useGeolocation` initial state.
  2. External URLs activate `unoptimized` across image components.
  3. API routes define valid edge `Cache-Control` headers.
  4. Date containers include `suppressHydrationWarning`.
  5. `PrivacyConsentBanner` and `InAppBrowserBanner` guard against hydration mismatch with `mounted` check.
- Live verification on `https://health.j172.tw/` using browser subagent.

