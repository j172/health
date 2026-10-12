# Feature Specification: Footer Link Data Integrity & CDC Alerts Sync Pipeline

## Overview

This specification establishes full data integrity and automated regression verification across all **48 links** in the site footer (`components/News/SiteFooter.tsx`), covering:
1. **Footer Link Health & Data Inventory**: Verification of 3 overview links, 4 brand/social links, and 41 tool catalog pages across 8 functional groups.
2. **CDC Travel Alerts Pipeline Fix & Dual-Track Resilience**: Resolving the empty data issue for `/tools/travel-epidemic-alerts` by updating remote endpoints, adding a local baseline CSV seed (`data/cdc-travel-alert.csv`, `data/cdc-intl-epid.csv`), and providing a standalone sync script `scripts/sync-cdc-alerts.mjs`.
3. **Automated Footer Regression Test Suite**: Adding `lib/server/tools/footerLinks.test.mjs` to the standard `npm test` suite to prevent dead links, uncataloged tools, or missing database configuration regressions.

---

## 1. Footer Link Catalog & Data Sources Inventory

The footer (`components/News/SiteFooter.tsx`) presents 48 navigational links divided into:

### 1.1 Overview & External Links (7 links)
* **全站總覽 (Overview)**:
  * `/` (首頁) - Live news feeds, top weather/air quality alerts, tool widgets.
  * `/news` (健康新聞列表) - Paginated, categorized health news articles.
  * `/privacy` (隱私權政策) - Complete site privacy and data policy document.
* **品牌與社群 (Brand & Social)**:
  * Logo (`/`), Instagram, Facebook, Threads, 主站 (`https://www.j172.tw`).

### 1.2 Tool Categories (41 tools across 8 functional groups)
* **醫療院所 (`facility` - 5 tools)**:
  * `clinics`: 25,140+ NHI medical centers, regional/district hospitals, clinics.
  * `pharmacies`: 19,217+ contracted and community pharmacies.
  * `drugs`: Dedicated TFDA/NHI drug licensing search (`/api/drugs`).
  * `home-healthcare`: 31,189+ home medical care providers.
  * `health-checks`: 650+ MOL certified occupational health check institutions.
* **長照機構 (`ltc` - 4 tools)**:
  * `long-term-care`: 4,172+ LTC facilities.
  * `ltc-contracted`: 15,398+ contracted LTC 2.0 service providers.
  * `elder-welfare`: 1,092+ senior welfare care institutions.
  * `hakka-bogong`: 556+ Hakka Affairs Council Bogong care stations.
* **身心障礙 (`disability` - 2 tools)**:
  * `disability-welfare`: 312+ disability welfare institutions.
  * `disability-atm`: 148+ accessible ATMs across credit cooperatives.
* **兒少福利 (`child-welfare` - 6 tools)**:
  * `kindergartens`: 6,747+ public, private, and non-profit kindergartens.
  * `cram-schools`: 17,767+ cram schools and tutoring centers.
  * `child-welfare-nurseries`: 201+ child care parent-child centers.
  * `family-cultural-activities`: 1,700+ family-friendly cultural events (`/api/culture/shows`).
  * `child-welfare-centers`: 37+ youth and child welfare support centers.
  * `child-safety-spots`: 186+ NPA child and women safety watch points.
* **便民服務 (`public-facility` - 8 tools)**:
  * `public-art`: Ministry of Culture public art map database (`/api/culture/public-art`).
  * `public-toilets`: 45,717+ public restrooms nationwide.
  * `cultural-events`: 1,700+ art and cultural exhibitions nationwide (`/api/culture/shows`).
  * `tax-organizations`: MOF registered non-profit organizations (`/api/tax-organizations`).
  * `travel-epidemic-alerts`: CDC global travel health notices & epidemic news.
  * `green-shops`: 8,594+ certified green shops.
  * `green-hotels`: 256+ certified green hotels.
  * `green-products`: MOENV green mark certified products (`/api/green-products`).
* **環境監測 (`weather` - 4 tools)**:
  * `uv`: Real-time CWA solar UV index across all weather stations.
  * `earthquakes`: Live CWA/USGS significant earthquakes and tsunami warnings.
  * `weather-alerts`: Active severe weather warnings & 1,300+ rainfall stations.
  * `aqi`: Real-time MOENV air quality index stations.
* **食品營養 (`food` - 2 tools)**:
  * `food-operators`: TFDA registered food businesses search (`/api/food-operators`).
  * `food-nutrition`: TFDA food composition & nutrition facts database (`/api/food-nutrition`).
* **健康算盤與工具 (`calculator` - 12 tools)**:
  * `calories`, `lbm`, `heart-rate`, `blood-pressure`, `nutrition`, `water`, `sleep`, `waist-hip`, `stress`, `body-fat`, `bmi`, `vo2max`.
  * Client-side interactive evaluators with medical references and formula tables.

---

## 2. CDC Travel Alerts Pipeline Fix & Dual-Track Resilience

### 2.1 Problem
* The remote CDC download endpoints (`https://data.cdc.gov.tw/download?...`) frequently experience connection resets, TLS handshake errors, or IP-range blocking from cloud/datacenter environments.
* Production table `cdc_travel_alerts` remained at 0 rows due to lack of an offline fallback seed.

### 2.2 Dual-Track Architecture
1. **Remote Ingestion Enhancement** (`lib/server/cdc/ingestCdcAlerts.ts`):
   * Add retry logic and proper user-agent headers via `fetchGovData`.
   * Support primary open data URLs and fallback to bundled CSV files if remote fetch times out or fails.
2. **Bundled Baseline Datasets** (`data/cdc-travel-alert.csv`, `data/cdc-intl-epid.csv`):
   * Curated and validated CSV datasets containing verified global travel health notices and international epidemic news.
3. **Local Sync CLI Script** (`scripts/sync-cdc-alerts.mjs`):
   * Allows running sync from developer workstations or GHA workflows directly against the production `/api/admin/cdc-sync` or local database.

---

## 3. Automated Regression Verification (`footerLinks.test.mjs`)

Add `lib/server/tools/footerLinks.test.mjs` to test:
1. **Catalog Integrity**: All tools configured in `TOOL_CATALOG` (`lib/server/tools/catalog.ts`) belong to a valid `ToolGroup` and have complete SEO titles, descriptions, and FAQs.
2. **Route Existence**: Every tool's `app/tools/[slug]/page.tsx` file exists on the filesystem.
3. **Collation Verification**: Verify that tools within each footer group adhere to `localeCompare('zh-Hant', { numeric: true })` first-character sorting.
4. **Facility Configuration Mapping**: Ensure every tool using `FacilitySearchContent` has an exact match in `facilitySearchConfigs` (`app/tools/facilityConfigs.ts`) with a non-empty `facilityType`.

---

## 4. Quality & Verification Gates
* `npm test`: All unit tests pass, including the new `footerLinks.test.mjs`.
* `npm run typecheck`: 0 TypeScript errors.
* `npm run build`: Successful production build.
* Production API sync: Verify `/api/cdc/travel-alerts` returns active alerts.
