# Full System Technical Specification (j172tw Healthz)

> **Document Version**: 2.4.0  
> **Last Updated**: 2026-08-23  
> **Status**: Production Specification  
> **Target Environment**: Next.js 16 (App Router) + Node 20 + MySQL 8.0 + cPanel PM2 Hosting + Cloudflare Edge CDN & Security

---

## 1. Executive Summary & Domain Scope

`j172tw Healthz` (https://health.j172.tw) is an integrated digital health and public utility platform. It unifies Taiwan public health news, environmental monitoring (live earthquakes, UV index, national AQI), health calculators, and healthcare facility registries into a single searchable, multi-lingual, and AI-search-optimized system.

---

## 2. System Architecture & Components

```
                          ┌───────────────────────────┐
                          │   Client Browser / Mobile │
                          └─────────────┬─────────────┘
                                        │ HTTPS (HTTP/3, 0-RTT, Brotli)
                          ┌─────────────▼─────────────┐
                          │  Cloudflare Edge CDN / WAF │ <-- Smart Tiered Cache, Transform Rules,
                          └─────────────┬─────────────┘     Rate Limiting & Managed Challenge
                                        │ Origin SSL Full (Strict)
                          ┌─────────────▼─────────────┐
                          │   PHP Handler Index Proxy │  <-- Serves Static Assets & Local Proxy
                          └─────────────┬─────────────┘
                                        │ (127.0.0.1:3000)
                          ┌─────────────▼─────────────┐
                          │   Next.js 16 App Router   │  <-- Node.js / PM2 (health-web)
                          └─────────────┬─────────────┘
                                        │
             ┌──────────────────────────┼──────────────────────────┐
             │                          │                          │
┌────────────▼───────────┐  ┌───────────▼───────────┐  ┌───────────▼───────────┐
│ MySQL 8.0 Database     │  │ i18n & OpenCC Engine  │  │ Outbound Native HTTP  │
│ (Pooled, Transaction)  │  │ (zh-TW, zh-CN, en)    │  │ (TWCA CA & WASM-safe) │
└────────────────────────┘  └───────────────────────┘  └───────────────────────┘
```

### 2.1 Technology Stack

- **Framework**: Next.js 16.2.x (App Router, Node.js runtime)
- **Frontend**: React 19, Tailwind CSS v4, Framer Motion, Swiper, Leaflet / React-Leaflet
- **Database**: MySQL 8.0 with `mysql2` promise driver
- **Theme**: `next-themes` (Dark Mode & Light Mode support)
- **i18n & Translation**: `LanguageContext` + `opencc-js` (Traditional to Simplified Chinese)

---

## 3. Data Ingestion & Storage Architecture

### 3.1 Network Layer (`lib/server/net/httpClient.ts`)

- **Custom Native HTTP Client**: Uses Node `node:http`/`node:https` instead of global `fetch()` to bypass Undici WASM `llhttp` memory ceilings under Linux shared hosting `ulimit -v` constraints.
- **Certificate Authority**: Bundles TWCA intermediate CA certificates for Taiwanese government domains (`.gov.tw`).

### 3.2 Database Access & Management (`lib/server/db/mysql.ts`)

- **Connection Pooling**: Managed via `getMysqlPool()` with `connectionLimit: 8` and `waitForConnections: true`.
- **Resource Release**: Guaranteed connection release via `withConnection` (`try-finally { conn.release() }`).
- **Transaction Safety**: `withTransaction` wraps operations in `beginTransaction()`, `commit()`, and `rollback()`.
- **Idempotent Migration**: `ensureSchema()` checks and applies `ADD COLUMN IF NOT EXISTS` and `ADD INDEX IF NOT EXISTS` automatically.
- **Concurrency Locking**: Mutual exclusion during cron ingestion using MySQL `GET_LOCK` and `RELEASE_LOCK`.

### 3.3 Query Caching & Performance (`lib/server/cache/memo.ts`)

- High-frequency queries (news items, weather warnings, latest AQI readings, latest UV readings) use `memoizeQuery` with TTL caching to minimize database load.
- `memoizeQuery`'s store is bounded (500 keys, expired-then-oldest eviction). Some cache keys embed user-supplied input such as the news `?keyword=` term, so an unbounded map would be a crawler-driven leak under the host's heap cap.
- `TOOL_CATALOG` is a static module array, not a cached query — it needs no memoization.

---

## 4. Internationalization (i18n) & Dynamic Translation

### 4.1 Supported Locales

1. `zh-TW` (正體中文) - Default
2. `zh-CN` (简体中文)
3. `en` (English)

### 4.2 Storage & Auto-Detection

- State managed via `LanguageContext`.
- Preferences stored in LocalStorage (`locale`) and Cookie (`locale`).
- Automatic initial detection via `navigator.language`: `en*` selects English; `zh-Hans` / `zh-CN` / `zh-SG` select Simplified; every other `zh*` stays Traditional.
- `SUPPORTED_LOCALES` in `LanguageContext` is the single list; the storage guard, the cookie guard and the `Locale` union all derive from it.

### 4.3 OpenCC Integration

- Integrated `opencc-js` (`OpenCC.Converter({ from: 'tw', to: 'cn' })`), loaded through a **dynamic import** the first time a reader selects `zh-CN`, so its conversion dictionaries stay out of every other reader's bundle. Until it resolves — and if it fails to load — text renders unconverted rather than blank.
- Exposed as `tDynamic(text)` on the language context, for live strings the dictionaries cannot cover. Server-rendered strings use the `components/ui/LocalizedText` wrapper so a single title can convert without its whole card becoming a client component.
- `locales/zh-CN.json` is **generated** from `locales/zh-TW.json` by `scripts/build-zh-cn-locale.mjs` using the same converter — never hand-edited, or new zh-TW keys would silently fall back to Traditional.
- Live API strings (earthquake epicenters, news titles, AQI station names) undergo real-time Traditional-to-Simplified Chinese conversion when `zh-CN` is active.
- Native English fields (e.g. USGS `item.place`) are prioritized when `en` is active.

---

## 5. Tool Catalog & First-Character Collation Specification

### 5.1 Sorting Rule

All 31 entries in `TOOL_CATALOG` (`lib/server/tools/catalog.ts`), every category on `/tools`, and all 8 link columns in `SiteFooter` (`components/News/SiteFooter.tsx`) are sorted by the first character using standard Traditional Chinese collation. The comparator is exported once as `compareToolTitles`, and `toolsInGroup(group, label)` applies it to a group — passing the _localized_ label, so the English footer is collated by what it actually renders:

```ts
items.sort((a, b) =>
  a.title.localeCompare(b.title, "zh-Hant", { numeric: true }),
);
```

### 5.2 Category Ordering

Eight footer columns: 全站總覽 (static links) plus one per `ToolGroup`. Ordering within a column is the 5.1 comparator applied to the **displayed** label, via `toolsInGroup(group, label)` — which is what keeps the English footer collated by the English titles it renders.

1. **全站總覽 (Overview)**: 首頁 ➔ 健康新聞列表 ➔ 隱私權政策
2. **醫療院所 (Medical Facilities)** (5): 健康檢查機構查詢 ➔ 居家醫療查詢 ➔ 藥品查詢 ➔ 藥局查詢 ➔ 醫療院所查詢
3. **長照機構 (LTC Facilities)** (4): 客家委員會「伯公照護站」查詢 ➔ 老人福利機構查詢 ➔ 長照機構查詢 ➔ 長照特約服務機構查詢
4. **身心障礙 (Disability Services)** (2): 信用合作社無障礙ATM查詢 ➔ 身心障礙福利機構查詢
5. **兒少福利 (Child & Youth Welfare)** (6): 兒少福利中心查詢 ➔ 全國幼兒園查詢 ➔ 全國短期補習班查詢 ➔ 全國親子館查詢 ➔ 全國親子藝文活動查詢 ➔ 婦幼安全警示地點查詢
6. **便民服務 (Public Services)** (5): 全國公廁查詢 ➔ 信用合作社無障礙ATM查詢 ➔ 國際旅遊疫情與即時情報地圖 ➔ 機關團體與扣繳單位查詢 ➔ 綠色商店查詢
7. **氣象觀測 (Weather & Hazards)** (3): 全台即時紫外線指數 (UV) ➔ 台灣與全球顯著地震查詢 ➔ 即時氣象警報與降雨資訊
8. **食品營養 (Food & Nutrition)** (2): 食品業者登錄查詢 ➔ 食品營養成分查詢
9. **健康算盤與工具 (Health Tools)** (14): AQI 空氣品質即時查詢 ➔ BMI 計算器 ➔ VO2Max 估算器 ➔ 卡路里需求計算器 ➔ 去脂體重 (LBM) 計算器 ➔ 壓力評估測驗 ➔ 每日營養素建議計算器 ➔ 目標心率計算器 ➔ 睡眠品質評估 ➔ 腰臀比計算器 ➔ 血壓分析器 ➔ 飲水量計算器 ➔ 體脂率計算器

Total: 37 tools across 8 groups. (Listed here in codepoint order for readability; the exact runtime order is whatever `localeCompare(…, "zh-Hant", { numeric: true })` yields.)

---

## 6. Deployment & Verification Standards

### 6.1 Quality Verification

- **TypeScript Integrity**: Verified with `npx tsc --noEmit` (0 errors).
- **Next.js Production Build**: Verified with `npm run build` (0 build errors, 81 routes compiled successfully).
- **Lint**: Verified with `npm run lint` (0 errors, 0 warnings).
- `npm run typecheck` is the named script for the `tsc --noEmit` gate.

### 6.2 Deployment Pipeline

- **GitHub Actions Workflow**: `.github/workflows/deploy-ftps.yml` builds `.next3` package, uploads prebuilt assets via FTPS, and triggers remote apply script `/.remote-health-index.php`.

---

## 7. Performance & SEO Optimizations

### 7.1 MySQL FULLTEXT `ngram` Search & Safety Fallback

- **Index**: Added `ft_news_search` FULLTEXT index on `(title, description_html, keywords)` with `ngram` Chinese parser in `ensureSchema()`.
- **Query Execution**: `searchNewsItems()` uses high-speed `MATCH(title, description_html, keywords) AGAINST(? IN BOOLEAN MODE)` with automatic fallback to `LIKE %query%` if FULLTEXT results yield no matches.

### 7.2 PWA Service Worker v2

- **`public/sw.js`**: Service Worker v2. **Network-First** for navigations, falling back to cache and then an offline page; **Stale-While-Revalidate** for static assets (served from cache, refreshed in the background).
- This is the reverse of what version 2.0.0 of this document described, and the code is the side that is right: this is a news site, so a navigation must not serve a stale article when the network is available, while hashed `/_next/static/` assets are immutable and safe to serve from cache immediately.

### 7.3 Google BreadcrumbList JSON-LD Schema

- **Schema**: `buildBreadcrumbJsonLd()` supplies BreadcrumbList JSON-LD on article pages (`/news/[id]`, inlined via `buildArticleJsonLd`), on `/tools`, on `/privacy`, and on every tool page through `ToolPageShell` -> `buildToolPageJsonLd`.
- Note there is no `/tools/[slug]` dynamic route: the 31 tool pages are individual static directories under `app/tools/`. Coverage arrives through the shared shell instead.
- **Sitemap**: `app/sitemap.ts` submits only indexable tools. The 16 registry-lookup pages set `robots: { index: false }`; the indexable set is exactly the `calculator` group, expressed once as `isToolIndexable()`.

### 7.4 Voice Reader (Text-to-Speech) & Immersive Reader Mode

- **`ArticleReaderToolbar.tsx`**: Uses Web Speech API (`window.speechSynthesis`) to read news articles (Title ➔ Author ➔ AI Summary ➔ Article Body). Supports Play/Pause/Resume/Stop, speed adjustment (0.8x - 2.0x), and automatic voice language selection based on active locale (`zh-TW`, `zh-CN`, `en`).
- **`ImmersiveReaderModal.tsx`**: Provides a fullscreen, distraction-free reading experience with customizable font sizes (A- / A / A+ / A++), an independent line-spacing control (緊密 / 標準 / 寬鬆), and a theme palette (Pure White, Sepia Warm, Deep Dark) that drives the modal's own chrome rather than following the site-wide theme. Both modals expose `role="dialog"`/`aria-modal`, trap Tab, restore focus to the opener on close, and lock background scroll via `components/ui/useModalA11y`.

### 7.5 Google Search Central, E-E-A-T & Google Discover/News Standards

- **Googlebot Directives**: All layout metadata configures `googleBot: { index: true, follow: true, "max-video-preview": -1, "max-image-preview": "large", "max-snippet": -1 }`, enabling high-res image cards for Google Discover and full-fidelity snippet extraction.
- **Search & Pagination Crawl Protection**: Paginated news archives (`page > 1`), keyword search query pages, and non-default page sizes enforce `robots: { index: false, follow: true }` to preserve crawl budget and prevent duplicate content dilution.
- **YMYL & E-E-A-T Schema Standards**:
  - `publisher.logo` uses `/images/icon/pwa-512.png` (512×512 PNG) meeting Google's high-resolution rectangular/square logo requirement.
  - `NewsArticle` schemas declare `author: { "@type": "NewsMediaOrganization", name, url }` with `isBasedOn` linking to original upstream government/media sources.
  - `Organization` schema includes `publishingPrinciples`, `ethicsPolicy`, `correctionsPolicy`, and `knowsAbout` domain signals.
  - Visible E-E-A-T Medical & Health Information Disclaimer is presented on all news detail and tool pages.
- **Google News & Image Sitemap**: `app/news-sitemap.xml/route.ts` limits items to 48 hours and embeds `<image:image>` (`<image:loc>`, `<image:title>`) tags via Google Image Sitemap extension namespace.
- **Multi-regional & Canonical Authority**: Single canonical URL structure anchored on `lang="zh-Hant-TW"` to concentrate PageRank and avoid thin machine-translated page penalties.
- **Core Web Vitals**: Unused external CDN preconnects pruned from `<head>` to minimize TLS handshake latency and accelerate LCP.

---

## 8. Subsystems Beyond Sections 1–7

Sections 1–7 grew from the original news/tools scope and do not describe
everything now running. Recorded here so the omission is not mistaken for
absence:

| Subsystem                                                     | Entry point                                                                                                                 |
| ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| In-process cron scheduler (8 jobs)                            | `lib/server/cron/registerJobs.ts`, started from `instrumentation.ts`                                                        |
| Card-image pipeline, 3 providers + OG scraping                | `lib/server/news/cardImages.ts`, `imageProviders.ts`, `backfillOgImages.ts`, `lib/server/{pixabay,pexels,unsplash,images}/` |
| Article geocoding & static maps                               | `lib/server/news/geoExtractor.ts`, `staticMap.ts`, `newsGeocodeBatch.ts`                                                    |
| Facilities registry across 16 sources, budget-aware geocoding | `lib/server/facilities/`                                                                                                    |
| Disability welfare charity sales & sheltered workshops        | `scripts/enrich-disability-charity-sales.mjs`, `components/Facilities/FacilitySearchContent.tsx`, `FacilityMap.tsx`         |
| TFDA drugs & food ingestion                                   | `lib/server/drugs/`, `lib/server/food/`                                                                                     |
| WRA drought bulletins                                         | `lib/server/wra/` (see `docs/specs/phase5-wra-drought-alerts.md`)                                                           |
| Social post draft queue                                       | `lib/server/social/`, `app/admin/social-queue/`                                                                             |
| Cloudflare Workers AI client                                  | `lib/server/cloudflare/aiClient.ts`                                                                                         |
| ~20 admin mutation endpoints                                  | `app/api/admin/*` — all gated by the timing-safe `requireAdminSecret`                                                       |
| ~29 database tables                                           | `lib/server/db/schema.ts` (`ensureSchema()` is the only schema authority; there is no DDL file)                             |

### 8.1 Disability Welfare Charity Sales Subsystem (愛心義賣)

- **Data Model & Schema**:
  - `facility_type = 'disability_welfare'`
  - **Government Registry vs. Custom Workshop Partitioning**: Official MOHW records retain `source_key = 'mohw_disability_welfare'`, enriched via `extra_json.charityUrl` and `extra_json.charityName: "愛心義賣"`. Standalone sheltered workshops, charity bakeries, and foundation shops missing from the government open dataset are ingested under `source_key = 'charity_sales'`, safeguarding them from overwrite during periodic MOHW CSV sync runs.
  - **Geocoding Guarantee**: 100% of charity sales facilities carry high-precision `lat` and `lng` coordinates for Haversine nearby search and interactive map rendering.
- **Frontend & Map UX**:
  - `FacilitySearchContent.tsx` checks `extra_json.charityUrl` and displays a prominent, accessible `🛍️ 愛心義賣 ↗` badge/button in the card header.
  - `FacilityMap.tsx` markers pass `charityUrl` and `charityName` to Leaflet `Popup` overlays, allowing direct outbound navigation (`target="_blank" rel="noopener noreferrer"`).
- **Maintenance & Ingestion**:
  - `scripts/enrich-disability-charity-sales.mjs` provides an idempotent batch migration runner with automatic HTTP redirect resolution for shortlinks (`pse.is`, `reurl.cc`, `forms.gle`).

### 8.2 Operational constraints that behave as standards

- The production host caps V8 at roughly 768MB. **No WASM-based rendering at
  request time** — `next/og` crash-looped production once for exactly this reason.
- `next start` reads `next.config.js` fresh from the working directory at
  runtime, not from the build output, so it must be in the deploy upload list.
- Merging to `main` does **not** deploy: `deploy-ftps.yml` is
  `workflow_dispatch` only.
- Never pipe-edit the production crontab (`crontab -l | … | crontab -`); it has
  wiped it before. `scripts/deploy-crontab.sh` writes through a file.
- `--insecure` on the FTPS upload and on the `--resolve`-pinned ops calls is
  deliberate and commented at each site: the host presents a shared-hostname
  certificate. Removing the flag requires pinning that certificate with
  `--cacert`, not deleting the flag.
- Outbound HTTP goes through `lib/server/net/httpClient.ts`, which now enforces
  `maxResponseBytes` (24MB default) both from `Content-Length` and while
### 8.3 Home News Grid Blog Post Integration Slot (j172tw Blogz)

- **Purpose & Scope**: Ingests the latest post from `https://blog.j172.tw/feed/` and places it as the 24th card in the home page "All" category news grid (`HomeCategoryNewsSection`), achieving exact visual parity with regular news cards while routing clicks directly to the destination post (`target="_blank" rel="noopener noreferrer"`).
- **Architecture & Ingestion (`lib/server/blog/queries.ts`)**:
  - Fetches the RSS feed with an ISR 1-hour cache (`revalidate: 3600`) and a 6-second `AbortController` timeout guard.
  - Automatically fetches and extracts the WordPress featured image (`wp-post-image` / `og:image`) with a 24-hour cache. If no image is present, gracefully falls back to the source-branded `j172tw Blogz` gradient card.
  - On network timeout or upstream feed failure, gracefully returns `null`, causing the grid to seamlessly fall back to the 24th standard news article without layout degradation.
- **RWD Grid Guarantee**: Fixed 24 cards (23 health news + 1 blog post) on the "All" tab guarantees 8 complete rows on 3-column desktop (`lg:grid-cols-3`) and 12 complete rows on 2-column tablet (`sm:grid-cols-2`), eliminating awkward trailing card voids.

---

## 9. Edge Architecture & Cloudflare Optimization Specification

All public HTTP traffic to `health.j172.tw` routes through Cloudflare Edge (Free Tier) acting as the Anycast CDN, WAF, and Reverse Proxy layer.

### 9.1 Network & SSL/TLS Configuration
- **Proxy Status**: DNS Proxied (Orange Cloud) for all web endpoints.
- **SSL/TLS Encryption Mode**: `Full (Strict)` with 15-year Cloudflare Origin CA certificate installed on origin.
- **Protocol Settings**:
  - `HTTP/3 (QUIC)` & `0-RTT Connection Resumption` enabled.
  - `Brotli` compression enabled (`content-encoding: br`).
  - `Early Hints (103)` enabled.
  - `Minimum TLS Version`: `1.2` (with TLS 1.3 0-RTT support).
  - `Rocket Loader`: **Disabled** (strictly avoided to eliminate React 19 hydration mismatch risks).
  - `Auto Minify`: **Disabled** (delegated exclusively to Next.js build-time minification).

### 9.2 Edge Cache Rules (`http_request_cache_settings`)
- **Smart Tiered Cache Topology**: Enabled globally to consolidate edge requests and minimize direct origin load.
- **Rule 1 (Admin Bypass)**:
  - Match: `(http.host eq "health.j172.tw" and (starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/api/admin")))`
  - Action: `Bypass cache`.
- **Rule 2 (Static Assets)**:
  - Match: `(http.host eq "health.j172.tw" and (starts_with(http.request.uri.path, "/_next/static/") or starts_with(http.request.uri.path, "/images/") or http.request.uri.path eq "/favicon.ico"))`
  - Action: `Eligible for cache` with `edge_ttl: respect_origin`, `browser_ttl: respect_origin` (`max-age=31536000, immutable`).
- **Rule 3 (Public HTML & SWR)**:
  - Match: `(http.host eq "health.j172.tw" and not (starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/api/admin")))`
  - Action: `Eligible for cache` with `edge_ttl: respect_origin` (leverages Next.js `s-maxage=60, stale-while-revalidate=600`).

### 9.3 Security & WAF Protection (`http_request_firewall_custom` & `http_ratelimit`)
- **Bot Fight Mode**: Active against malicious automated scrapers.
- **Custom WAF Rule (Admin Protection)**:
  - Match: `(http.host eq "health.j172.tw" and (starts_with(http.request.uri.path, "/admin") or starts_with(http.request.uri.path, "/api/admin"))) and (cf.threat_score gt 0 or not ip.geoip.country in {"TW"})`
  - Action: `Managed Challenge`.
- **Custom WAF Rule (Threat Score Mitigation)**:
  - Match: `(http.host eq "health.j172.tw" and cf.threat_score ge 15)`
  - Action: `Block`.
- **Rate Limiting Rule**:
  - Match: `(http.host eq "health.j172.tw" and (starts_with(http.request.uri.path, "/api/") or starts_with(http.request.uri.path, "/admin")))`
  - Limit: Single IP exceeding 30 requests per 10 seconds -> Block for 10 seconds.

### 9.4 Edge Transform Rules (`http_response_headers_transform`)
- Injects standard security headers and scrubs origin fingerprinting at the edge:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(self)`
  - `X-Powered-By` header stripped.

