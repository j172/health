# Feature Specification: Google Preferred Source Button & Simplified Chinese Decommissioning

## Overview

This specification formalizes two structural enhancements to `j172tw Healthz` (https://health.j172.tw):
1. **Google Preferred Source CTA Integration**: Adding a prominent Google Preferred Source button (`q=health.j172.tw`) to every news article detail page (`/news/[id]`) to boost reader retention and Google News/Discover distribution.
2. **Complete Decommissioning of Simplified Chinese (zh-CN)**: Purging all Simplified Chinese locale dictionaries, generator scripts, OpenCC dynamic conversion engines, language toggle options, and SEO alternate locale tags to streamline the application bundle, eliminate unnecessary client-side dependencies, and focus exclusively on Traditional Chinese (`zh-TW`) as the authoritative standard alongside English (`en`).

---

## 1. Technical Architecture & Changes

### 1.1 Google Preferred Source Button

- **Component**: `components/News/GooglePreferredSourceButton.tsx`
  - Target URL: `https://www.google.com/preferences/source?q=health.j172.tw`
  - Tooltip: `請點選打勾將 j172tw Healthz 設為首選來源，在 Google 上查看更多我們的精彩報導`
  - Icon: Google 4-color SVG logo (`#FFC107`, `#FF3D00`, `#4CAF50`, `#1976D2`)
  - Label: `加入Google首選`
  - Design & Styling:
    - Rounded pill button (`rounded-full border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800`)
    - Hover elevation and smooth transition
    - Responsive layout: placed in the article footer navigation bar alongside `前往官方原始網頁 ↗`
- **Article Detail Page Placement**:
  - `app/news/[id]/page.tsx`: Embedded within the article bottom action toolbar.

### 1.2 Simplified Chinese Decommissioning

- **UI Language Toggler**:
  - `components/Header/LanguageToggler.tsx`: Remove `zh-CN` option; keep `zh-TW` (正體中文 🇹🇼) and `en` (English 🇺🇸).
- **Core Locale Context**:
  - `app/context/LanguageContext.tsx`:
    - Update `SUPPORTED_LOCALES` to `["zh-TW", "en"]`.
    - Remove `locales/zh-CN.json` import and mapping.
    - Remove dynamic `opencc-js` converter loading and conversion state.
    - Update client locale detection: non-English browsers default directly to `zh-TW`.
- **Files Deleted**:
  - `locales/zh-CN.json`
  - `scripts/build-zh-cn-locale.mjs`
- **Dependencies Cleaned**:
  - `opencc-js` removed from runtime requirements.
- **SEO & OpenGraph Tags**:
  - `app/(site)/layout.tsx`: `alternateLocale: ["en_US"]`
  - `app/news/layout.tsx`: `alternateLocale: ["en_US"]`
  - `app/tools/layout.tsx`: `alternateLocale: ["en_US"]`
  - `app/tools/page.tsx`: `alternateLocale: ["en_US"]`
  - `lib/server/news/seo.ts`: `alternateLocale: ["en_US"]`

---

## 2. Verification Plan

1. **Unit Tests**:
   - `npm test`: Verify all existing tests and add tests asserting Simplified Chinese locale removal and Google Preferred Source button presence.
2. **Type Checking**:
   - `npm run typecheck`: Ensure zero TypeScript compilation errors.
3. **Production Build**:
   - `npm run build`: Verify Next.js Turbopack build succeeds without broken imports or bundle issues.
4. **Live Verification**:
   - Verify `/c0e7b8782f9c464c8d5c414995f7c32e.txt` and `/news/[id]` on production after deployment.
