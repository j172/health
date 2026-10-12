# Feature Specification: Map Navigation, Japanese & Korean i18n with SEO/AEO/GEO, and 3-Tier ISR Performance Optimization

**Issue**: #418  
**Status**: In Progress  
**Authors**: Antigravity Assistant & Development Team  
**Date**: 2026-09-24  

---

## 1. Overview

This specification establishes the technical implementation plan for three major interconnected enhancements:
1. **Google Maps Navigation Deeplinks**: Providing a unified, multilingual `🗺️ Google 地圖導航` button across all facility list cards and standalone interactive map tools.
2. **Japanese (`ja`) & Korean (`ko`) Multi-Language Support with SEO / AEO / GEO**:
   - Introducing `locales/ja.json` and `locales/ko.json` with 90+ tool catalog definitions and UI strings.
   - Preserving the stable URL structure via `?lang=ja|ko` parameters combined with SSR `hreflang` alternates and Schema.org JSON-LD.
   - Enhancing tourist-critical tools (Emergency Rooms, AEDs, Clinics, Pharmacies, YouBike, Weather, Disasters, Sightseeing Factories) with localized `directAnswer` and FAQ structures.
   - Providing 3-tier language detection (`?lang=` > Cookie/LocalStorage > `navigator.language`).
3. **3-Tier ISR (Incremental Static Regeneration) Performance Optimization**:
   - Implementing `generateStaticParams()` for `app/news/[id]/page.tsx` to statically pre-render top public health news articles.
   - Transitioning erroneously configured `force-dynamic` static pages (`/privacy`, `/llm-info`, `/news`) to ISR.
   - Converting real-time dashboards (ER status, CPC fuel prices/stations, Power Grid) from un-cached `force-dynamic` to short-cycle 30s-60s ISR to prevent database thundering herd under spike traffic.

---

## 2. Technical Architecture & Design

### 2.1 Google Maps Navigation (`lib/utils/mapNavigation.ts`)

A standardized helper to generate Google Maps direction/navigation URLs:
```ts
export interface MapNavigationOptions {
  name: string;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export function buildGoogleMapsDirUrl(opts: MapNavigationOptions): string;
export function getNavigationButtonLabel(locale: string): string;
```

- **URL Protocol**:
  - Uses `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`.
  - Destination priority:
    1. If `lat` and `lng` exist: `${name} ${lat},${lng}` or `${name} ${address}` with coords for high precision.
    2. Fallback: `${address || ""} ${name}`.
- **Card Integration**:
  - Shared: `components/Facilities/FacilitySearchContent.tsx` (covers 20+ facility tools: clinics, pharmacies, aed, cram schools, kindergartens, public toilets, bookstores, green hotels, tourism factories, etc.).
  - Standalone map tools: `YoubikeContent.tsx`, `EmergencyRoomContent.tsx`, `CpcStationsClient.tsx`, `DisasterMapContent.tsx`, `BreastfeedingMapContent.tsx`, `ContraceptionMapContent.tsx`, `CulturalEventsContent.tsx`, `PetAdoptionContent.tsx`, `AccessibleTransitContent.tsx`, `InundationMapContent.tsx`, `WaterOutagesContent.tsx`.

---

### 2.2 Japanese & Korean i18n with SEO / AEO / GEO

- **Supported Locales**:
  `export type Locale = "zh-TW" | "en" | "ja" | "ko";`
  `export const SUPPORTED_LOCALES: Locale[] = ["zh-TW", "en", "ja", "ko"];`
- **Dictionaries**:
  - `locales/ja.json`: Full Japanese translation of navigation, categories, home, footer, general tools, and 90+ tool titles & descriptions.
  - `locales/ko.json`: Full Korean translation of navigation, categories, home, footer, general tools, and 90+ tool titles & descriptions.
- **Language Detection & Persistence**:
  1. Priority 1: URL search parameter `?lang=ja` or `?lang=ko` (writes to `cookie` and `localStorage`).
  2. Priority 2: Stored `localStorage` / `cookie` value.
  3. Priority 3: Browser `navigator.language` (auto-detects `ja` or `ko`).
- **SEO & AEO Crawler Accessibility**:
  - `app/layout.tsx`:
    - Injects `<link rel="alternate" hreflang="zh-TW" ...>`
    - Injects `<link rel="alternate" hreflang="en" ...>`
    - Injects `<link rel="alternate" hreflang="ja" ...>`
    - Injects `<link rel="alternate" hreflang="ko" ...>`
    - OpenGraph alternates: `alternateLocale: ["en_US", "ja_JP", "ko_KR"]`.
  - `app/sitemap.ts`:
    - Incorporates language alternates in sitemap entries.
  - `app/llms.txt/route.ts`:
    - Documents `ja` and `ko` endpoints and public health capabilities for AI agents.

---

### 2.3 3-Tier ISR Performance Optimization

1. **News Detail Pages (`app/news/[id]/page.tsx`)**:
   - Introduce `generateStaticParams()` returning the latest 60 articles at build time (`listNewsForSitemap(60)`).
   - Retain `export const revalidate = 60;` for smooth background revalidation.
2. **Static & Metadata Pages**:
   - `app/privacy/page.tsx`: Replace `dynamic = "force-dynamic"` with `revalidate = 86400` (static daily ISR).
   - `app/llm-info/page.tsx`: Replace `dynamic = "force-dynamic"` with `revalidate = 3600`.
   - `app/news/page.tsx`: Replace `dynamic = "force-dynamic"` with `revalidate = 60`.
3. **Live Dashboards with Database Guard**:
   - `app/tools/er-status/page.tsx`: Replace `dynamic = "force-dynamic"` with `revalidate = 30`.
   - `app/tools/power-grid-overview/page.tsx`: Replace `dynamic = "force-dynamic"` with `revalidate = 60`.
   - `app/tools/cpc-prices/page.tsx`: Replace `dynamic = "force-dynamic"` with `revalidate = 60`.
   - `app/tools/cpc-stations/page.tsx`: Replace `dynamic = "force-dynamic"` with `revalidate = 300`.

---

## 3. Verification & Acceptance Criteria

1. **Type Safety**: `npm run typecheck` exits with code 0.
2. **Unit & Integration Tests**: `npm test` passes all tests without regression.
3. **Build & ISR Pre-rendering**: `npm run build` succeeds, generating SSG / ISR pages for pre-rendered news and tools.
4. **Deploy**: Deployed through GitHub Actions FTPS workflow to live environment.
