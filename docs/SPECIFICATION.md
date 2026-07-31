# Full System Technical Specification (j172tw Healthz)

> **Document Version**: 2.0.0  
> **Last Updated**: 2026-08-01  
> **Status**: Production Specification  
> **Target Environment**: Next.js 16 (App Router) + Node 20 + MySQL 8.0 + cPanel PM2 Hosting

---

## 1. Executive Summary & Domain Scope

`j172tw Healthz` (https://health.j172.tw) is an integrated digital health and public utility platform. It unifies Taiwan public health news, environmental monitoring (live earthquakes, UV index, national AQI), health calculators, and healthcare facility registries into a single searchable, multi-lingual, and AI-search-optimized system.

---

## 2. System Architecture & Components

```
                          ┌───────────────────────────┐
                          │   Client Browser / Mobile │
                          └─────────────┬─────────────┘
                                        │ HTTPS / Reverse Proxy
                          ┌─────────────▼─────────────┐
                          │   PHP Handler Index Proxy │  <-- Serves Static Assets & Caching
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
* **Framework**: Next.js 16.0.10 (App Router, Node.js runtime)
* **Frontend**: React 19, Tailwind CSS v4, Framer Motion, Swiper, Leaflet / React-Leaflet
* **Database**: MySQL 8.0 with `mysql2` promise driver
* **Theme**: `next-themes` (Dark Mode & Light Mode support)
* **i18n & Translation**: `LanguageContext` + `opencc-js` (Traditional to Simplified Chinese)

---

## 3. Data Ingestion & Storage Architecture

### 3.1 Network Layer (`lib/server/net/httpClient.ts`)
* **Custom Native HTTP Client**: Uses Node `node:http`/`node:https` instead of global `fetch()` to bypass Undici WASM `llhttp` memory ceilings under Linux shared hosting `ulimit -v` constraints.
* **Certificate Authority**: Bundles TWCA intermediate CA certificates for Taiwanese government domains (`.gov.tw`).

### 3.2 Database Access & Management (`lib/server/db/mysql.ts`)
* **Connection Pooling**: Managed via `getMysqlPool()` with `connectionLimit: 8` and `waitForConnections: true`.
* **Resource Release**: Guaranteed connection release via `withConnection` (`try-finally { conn.release() }`).
* **Transaction Safety**: `withTransaction` wraps operations in `beginTransaction()`, `commit()`, and `rollback()`.
* **Idempotent Migration**: `ensureSchema()` checks and applies `ADD COLUMN IF NOT EXISTS` and `ADD INDEX IF NOT EXISTS` automatically.
* **Concurrency Locking**: Mutual exclusion during cron ingestion using MySQL `GET_LOCK` and `RELEASE_LOCK`.

### 3.3 Query Caching & Performance (`lib/server/cache/memo.ts`)
* High-frequency queries (news items, weather warnings, tool catalogs) use `memoizeQuery` with TTL caching to minimize database load.

---

## 4. Internationalization (i18n) & Dynamic Translation

### 4.1 Supported Locales
1. `zh-TW` (正體中文) - Default
2. `zh-CN` (简体中文)
3. `en` (English)

### 4.2 Storage & Auto-Detection
* State managed via `LanguageContext`.
* Preferences stored in LocalStorage (`locale`) and Cookie (`locale`).
* Automatic initial detection via `navigator.language`.

### 4.3 OpenCC Integration
* Integrated `opencc-js` (`OpenCC.Converter({ from: 'tw', to: 'cn' })`).
* Live API strings (earthquake epicenters, news titles, AQI station names) undergo real-time Traditional-to-Simplified Chinese conversion when `zh-CN` is active.
* Native English fields (e.g. USGS `item.place`) are prioritized when `en` is active.

---

## 5. Tool Catalog & First-Character Collation Specification

### 5.1 Sorting Rule
All 14+ entries in `TOOL_CATALOG` (`lib/server/tools/catalog.ts`) and all 5 link columns in `SiteFooter` (`components/News/SiteFooter.tsx`) are sorted by the first character using standard Traditional Chinese collation:
```ts
items.sort((a, b) => a.title.localeCompare(b.title, "zh-Hant", { numeric: true }));
```

### 5.2 Category Ordering
1. **全站總覽 (Overview)**: 首頁 ➔ 健康新聞列表 ➔ 隱私政策與宣告
2. **醫療院所 (Medical Facilities)**: 健康檢查機構查詢 ➔ 居家醫療查詢 ➔ 醫療院所查詢 ➔ 藥局查詢 ➔ 藥品查詢
3. **長照機構 (LTC Facilities)**: 客庄社區發展協會查詢 ➔ 身心障礙福利機構查詢 ➔ 老人福利機構查詢 ➔ 長照機構查詢 ➔ 長照特約服務機構查詢
4. **食品營養 (Food & Nutrition)**: 食品營養成分查詢 ➔ 食品業者登錄查詢
5. **健康算盤與工具 (Health Tools)**: 全台即時紫外線指數 (UV) ➔ 全球顯著地震查詢 ➔ 卡路里需求計算器 ➔ 去脂體重 (LBM) 計算器 ➔ 每日營養素建議計算器 ➔ 目標心率計算器 ➔ 血壓分析器 ➔ 飲水量計算器 ➔ 體脂率計算器 ➔ 腰臀比計算器 ➔ 睡眠品質評估 ➔ 壓力評估測驗 ➔ AQI 空氣品質即時查詢 ➔ BMI 計算器 ➔ VO2Max 估算器

---

## 6. Deployment & Verification Standards

### 6.1 Quality Verification
* **TypeScript Integrity**: Verified with `npx tsc --noEmit` (0 errors).
* **Next.js Production Build**: Verified with `npm run build` (0 build errors, 74 routes compiled successfully).

### 6.2 Deployment Pipeline
* **GitHub Actions Workflow**: `.github/workflows/deploy-ftps.yml` builds `.next3` package, uploads prebuilt assets via FTPS, and triggers remote apply script `/.remote-health-index.php`.
