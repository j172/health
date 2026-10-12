# Feature Specification: IndexNow Protocol & Microsoft Clarity Analytics Integration

## Overview

This specification formalizes the integration of **IndexNow** search engine instant indexing and **Microsoft Clarity** user behavior and session analytics for `j172tw Healthz` (https://health.j172.tw).

---

## 1. Problem Statement & Motivation

1. **Search Engine Discovery Latency**:
   - Traditional search engine crawling depends on recurring sitemap polling (e.g. `sitemap.xml`, `news-sitemap.xml`).
   - Breaking public health notices, epidemic alerts, and official medical bulletins benefit from immediate indexing by participating search engines (Microsoft Bing, Yandex, Seznam, Naver).
   - IndexNow provides an open push protocol: the publisher notifies search engines instantly when URLs are created or updated.

2. **User Experience & Interaction Insights**:
   - In order to optimize usability across 41+ health calculators, registry search tools, and news readers, real-time heatmaps, scroll tracking, and session diagnostics are required.
   - Microsoft Clarity provides privacy-conscious, lightweight analytics (project ID: `ye0lvdgk17`).
   - Tracking must seamlessly adhere to user consent established in `components/Legal/PrivacyConsentBanner.tsx` (GDPR, CCPA, and Taiwan PDPA compliance).

---

## 2. Technical Architecture & Implementation

### 2.1 Microsoft Clarity Analytics Integration

- **Component**: `components/Analytics/MicrosoftClarity.tsx`
  - Loads script asynchronously using Next.js `next/script` (`strategy="afterInteractive"`).
  - Project ID: `ye0lvdgk17`.
  - Checks stored consent (`j172-consent-analytics`) upon initialization.
- **Root Layout Mounting**:
  - Mounted alongside `GoogleTag` across all public-facing root layouts:
    - `app/(site)/layout.tsx` (Home, blog, docs, error pages)
    - `app/news/layout.tsx` (Health news archive and detail pages)
    - `app/tools/layout.tsx` (All 41+ interactive tools and database registries)
    - `app/privacy/layout.tsx` (Privacy and legal compliance policy)
- **Privacy Consent Synchronization**:
  - `components/Legal/PrivacyConsentBanner.tsx`:
  - When user selects "同意並接受" or "僅必要功能", calls `window.clarity("consent", grantAnalytics)`.

### 2.2 IndexNow Protocol Implementation

- **API Key & Ownership Verification**:
  - Protocol requires hosting `<key>.txt` containing `<key>` at the site root.
  - Key: `c0e7b8782f9c464c8d5c414995f7c32e` (32-character hexadecimal).
  - Verification file: `public/c0e7b8782f9c464c8d5c414995f7c32e.txt`.
  - Configured in `.env` and `.env.example` as `INDEXNOW_KEY`.
- **Client Library**: `lib/server/seo/indexnow.ts`
  - `submitToIndexNow(urls: string[])`:
    - Normalizes and deduplicates URLs.
    - Validates that URLs belong to current `host`.
    - Automatically chunks payloads into batches of up to 10,000 URLs (IndexNow API limit).
    - Posts JSON to `https://api.indexnow.org/indexnow`.
  - `submitRecentNewsToIndexNow(limit?: number)`: Submits latest news articles.
  - `submitCorePagesToIndexNow()`: Submits high-priority site pages (home, news, tools, catalog pages, privacy).
- **Automated Ingestion Push**:
  - `lib/server/rss/persistItems.ts`: Collects and returns `insertedIds` for newly inserted records (`affectedRows === 1`).
  - `lib/server/rss/runIngestion.ts`: Dispatches asynchronous background IndexNow submission whenever new articles are ingested.
- **Admin Ops Endpoint**: `app/api/admin/indexnow/route.ts`
  - Protected by `requireAdminSecret`.
  - `GET`: Inspects IndexNow key, host, and verification URL status.
  - `POST`: Supports manual batch pushes (`{ urls: [...] }`), `{ action: "latest-news" }`, and `{ action: "sitemap" }`.
- **Scheduled Synchronization**:
  - `lib/server/cron/registerJobs.ts`: Daily 05:00 cron job submits the latest 100 articles to maintain search engine index freshness.

---

## 3. Verification Plan

1. **Automated Tests**:
   - `lib/server/seo/indexnow.test.mjs` verifying verification file format, presence in `public/`, and Clarity configuration.
   - Project-wide unit tests: `npm test` (all 123 tests passing).
2. **Type Safety**:
   - `npm run typecheck` (`tsc --noEmit`) passing with zero errors.
3. **Production Build**:
   - `npm run build` compiled cleanly with Turbopack and valid static asset generation.
