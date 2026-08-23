# Feature Specification: Weather Alerts, Rainfall Locator & Navigation Restructure

## Overview

This specification establishes:
1. A dedicated real-time Weather Alerts & Rainfall observation tool page (`/tools/weather-alerts`), aggregating CWA datasets (`W-C0033-003`, `W-C0033-004`, `W-C0033-005`, `W-C0034-001`, `W-C0034-005`) and nearest rainfall station statistics (`C-B0025-001` daily/monthly/yearly history + `O-A0002-001` real-time accumulation) based on user GPS or county selection.
2. NewsSidebar's `WeatherAlertSidebarWidget` enhancement: integrates tsunami warnings (`cwa_tsunamis` / `E-A0014-001`) and township hazard warnings (`cwa_township_hazards` / `W-C0033-001`) alongside general weather alerts.
3. Navigation restructure:
   - Merges 綠色商店 (`green-shops`) into 公共設施 (`public-facility`). Adds 公共設施 dropdown in Navbar and consolidates the Footer column.
   - Creates a new 氣象觀測 (`weather`) group containing 顯著地震 (`earthquakes`), 紫外線指數 (`uv`), 空氣品質 (`aqi`), and 即時氣象警報 (`weather-alerts`). Adds 氣象觀測 dropdown in Navbar and column in Footer.

---

## 1. Tool Catalog & Group Types

In [`lib/server/tools/catalog.ts`](../../lib/server/tools/catalog.ts):
- Extend `ToolGroup` union with `"weather"`.
- Change `earthquakes`, `uv`, `aqi` group to `"weather"`.
- Change `green-shops` group to `"public-facility"`.
- Add `weather-alerts` catalog entry under `group: "weather"` with full AEO directAnswer, CWA scientific basis, precipitation reference table, related slugs, and FAQs.
- Update `isToolIndexable` to include `tool.group === "weather"`.

---

## 2. Server CWA Queries & API

In [`lib/server/cwa/queries.ts`](../../lib/server/cwa/queries.ts):
- Update `listActiveCwaAlerts`:
  - Fetch active tsunami warnings from `cwa_tsunamis` (`E-A0014-001`), map to top-priority Extreme alert items.
  - Fetch active township hazards from `cwa_township_hazards` (`W-C0033-001`), aggregate affected townships by phenomenon.
  - Combine with active `cwa_alerts` (W-C0033-003~005, W-C0034-001/005, dust storms) with severity ranking.
- Add `getNearestRainfallOverview(lat, lng)`:
  - Resolves closest real-time rain gauge (`cwa_rainfall` / `O-A0002-001` with 10min, 1hr, 24hr rainfall).
  - Resolves closest staffed station history (`cwa_daily_rainfall` / `C-B0025-001` with month_mm, year_mm, wet_days_30).
- Add `listTopRainfallStations(limit)`:
  - Returns top stations with highest 24hr precipitation for leaderboard fallback.

In [`app/api/weather/rainfall/route.ts`](../../app/api/weather/rainfall/route.ts):
- Dynamic GET endpoint accepting `lat` and `lng` query parameters (or county fallback) to return nearest rainfall details and top rain stations.

---

## 3. Navbar & Footer Restructure

In [`components/News/SiteNav.tsx`](../../components/News/SiteNav.tsx):
- Remove standalone `Link` to `/tools/green-shops`.
- Add `NavDropdown` for `公共設施` (containing `green-shops` and `public-toilets`).
- Add `NavDropdown` for `氣象觀測` (containing `earthquakes`, `uv`, `aqi`, `weather-alerts`).
- Keep `健康工具` dropdown containing remaining health/vital calculators.
- Mirror same grouping in the mobile drawer.

In [`components/News/SiteFooter.tsx`](../../components/News/SiteFooter.tsx):
- Remove standalone `綠色商店` column.
- Render `公共設施` column (`publicFacilityTools` showing `green-shops` and `public-toilets`).
- Render `氣象觀測` column (`weatherTools` showing `weather-alerts`, `uv`, `aqi`, `earthquakes`).
- Total footer columns: exactly 9 (`xl:grid-cols-9`), preserving layout balance.

In [`app/tools/page.tsx`](../../app/tools/page.tsx):
- Organize tools into categories: `environment` ("即時氣象與環境觀測"), `public-facility` ("公共設施與綠色生活"), `food` ("食品營養與業者登錄").

---

## 4. UI Components & Pages

In [`components/Tools/WeatherAlertSidebarWidget.tsx`](../../components/Tools/WeatherAlertSidebarWidget.tsx):
- Render tsunami alerts with distinctive red badge and urgent banner.
- Render township hazard warnings with aggregate township list tags.
- Direct footer link to `/tools/weather-alerts`.

In [`app/tools/weather-alerts/page.tsx`](../../app/tools/weather-alerts/page.tsx):
- Full page layout with `ToolPageShell` (structured data + metadata).
- Interactive client locator `WeatherRainfallLocator.tsx` with browser geolocation, county select, nearest station stats, and top rainfall leaderboard.
- Real-time weather alerts cards list.
- CWA rainfall warning criteria table and guidelines.

---

## 5. Locales

In [`locales/zh-TW.json`](../../locales/zh-TW.json), [`locales/en.json`](../../locales/en.json), [`locales/zh-CN.json`](../../locales/zh-CN.json):
- Add `nav.weather`, `nav.publicFacilities`, `catalog.weather-alerts` translations.

---

## 6. Verification Plan

- `npx tsc --noEmit` — 0 errors.
- `npm run build` — 0 errors.
- Verify `/tools/weather-alerts` rendering, GPS locate, and alert cards.
- Verify NewsSidebar `WeatherAlertSidebarWidget`.
- Verify SiteNav and SiteFooter items and responsive mobile layout.
