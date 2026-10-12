# Feature Specification: Hakka Affairs Council "Bo-Gong Care Station" Lookup (客家委員會「伯公照護站」查詢)

## Overview

Renames and updates the Hakka community facility lookup tool from "客庄社區發展協會查詢" (`/tools/hakka-community`) to "客家委員會「伯公照護站」查詢" (`/tools/hakka-bogong`). The data source remains the Hakka Affairs Council open data endpoint `https://cloud.hakka.gov.tw/Pub/Opendata/DTST20230600002.json` with seamless backend integration.

## 1. Routing & 301 Redirect

- New Canonical Route: `/tools/hakka-bogong`
- Legacy Route: `/tools/hakka-community` configured with a 301 Permanent Redirect in `next.config.js` pointing to `/tools/hakka-bogong`.

## 2. Tool Presentation & Catalog Entry

- **Slug**: `hakka-bogong`
- **Group**: `ltc` (長照與福利)
- **Emoji**: `🧓` (高齡關懷與文化照護)
- **Title**: `客家委員會「伯公照護站」查詢`
- **Description**: `查詢客家委員會「伯公照護站」名冊，支援關鍵字搜尋與附近定位。`
- **Direct Answer**: `查詢客家委員會核准設立之伯公照護站名冊，提供客庄長者客語溝通、文化傳承、健康促進與長照關懷據點資訊。`
- **Scientific Basis**:
  - Title: `客家委員會開放資料 - 伯公照護站名冊`
  - Authority: `客家委員會 (HAC)`
  - URL: `https://cloud.hakka.gov.tw/Pub/Opendata/DTST20230600002.json`
- **Related Slugs**: `["ltc-contracted", "elder-welfare"]`
- **FAQs**:
  - Question: `什麼是「伯公照護站」？提供哪些服務？`
  - Answer: `「伯公照護站」為客家委員會配合衛生福利部長照 2.0 政策，結合客庄在地資源（如社區發展協會、C 級巷弄長照站）推動之據點。除了提供共餐、關懷訪視與延緩失能課程外，特別融入客語環境、客家歌謠與文化健康活動，提供貼近客庄長者生活背景的在地照顧。`

## 3. Frontend Search Configuration (`facilityConfigs.ts`)

- Key: `"hakka-bogong"`
- `facilityType`: `"hakka_community"` (maps to backend DB table without schema migration)
- `emoji`: `"🧓"`
- `title`: `"客家委員會「伯公照護站」查詢"`
- `description`: `"查詢客家委員會「伯公照護站」名冊。資料來源：客家委員會開放資料。"`
- `searchPlaceholder`: `"輸入站點名稱、協會或縣市關鍵字"`
- `errorText`: `"查詢伯公照護站資料失敗，請稍後再試。"`
- `emptyStateNoKeyword`: `"附近查無收錄的伯公照護站，可改用關鍵字搜尋。"`
- `emptyStateWithKeyword`: `"查無符合的伯公照護站。"`

## 4. Backend & Data Layer

- Backend `facilityType`: `hakka_community`
- `sourceKey`: `hakka_dtst20230600002`
- Ingestion endpoint: `https://cloud.hakka.gov.tw/Pub/Opendata/DTST20230600002.json`
- Labels in batch geocode scripts updated to `客委會伯公照護站`.

## 5. Multi-language (i18n)

- `locales/en.json`:
  - `"hakka-bogong": "Hakka Affairs Council Bo-Gong Care Station Finder"`

## 6. Verification & Quality Assurance

- Type checking: `npx tsc --noEmit` returns 0 errors.
- Build verification: `npm run build` succeeds.
- Automated tests: `node --test` / test suites pass.
- 301 Redirect verification: `/tools/hakka-community` redirects to `/tools/hakka-bogong`.
- Tool listing: `/tools` displays `🧓 客家委員會「伯公照護站」查詢`.
