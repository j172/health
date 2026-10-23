# 規格書：全國產後護理之家地圖（月子中心查詢）

- **建立日期**：2026-10-23
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯研究**：[`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md)（Top 15 #8）
- **主要資料源**：衛生福利部「全國開業護理機構清冊」[data.gov.tw/115950](https://data.gov.tw/dataset/115950)

---

## Problem Statement

對於台灣的新生兒父母與待產準媽媽而言，尋找適合且合格的產後護理機構（俗稱月子中心）是一項重大人生決策。然而，目前市面資訊高度分散且充斥商業廣告、網紅業配與不透明的推薦文，民眾往往面臨以下痛點：

1. **合法立案與評鑑狀態不透明**：難以直觀確認某機構是否為政府正式核准立案之產後護理機構，亦無法快速得知衛福部之定期評鑑結果（合格、優等、不合格或待評鑑）以及評鑑合格效期。
2. **核准床數與嬰兒照護比難以驗證**：官方核准的產婦床與嬰兒床數量是衡量機構照護負荷與感染管制的重要指標，但民眾在商業網站上僅能看到房型宣傳，無從得知官方登記的床數規模。
3. **缺乏客觀且無商業干擾的地理查詢工具**：商業平台多以付費廣告進行排名，缺乏以真實距離（GPS 附近公里數）與行政分區（縣市鄉鎮）為核心的公正查詢地圖。

---

## Solution

建立一個由政府官方開放資料驅動、完全無商業干擾、極速且行動裝置優先的民生工具——**「全國產後護理之家地圖（月子中心查詢）」**（`/tools/postpartum-care`）：

1. **權威官方數據**：直接介接衛福部「全國開業護理機構清冊」，收錄全台 241 家合法開業之產後護理之家，杜絕非法地下月子中心。
2. **全數自帶精確經緯度**：原始清冊具備 99.9% 之 WGS84 座標覆蓋率，支援精確定位與地圖距離演算。
3. **公開關鍵指標**：卡片與地圖彈窗直接揭露「評鑑合格狀態」、「評鑑合格效期」、「核准產婦床數」與「核准嬰兒床數」。
4. **直覺的多維度檢索**：支援手機一鍵 GPS 定位尋找最近機構、縣市選單切換、關鍵字模糊搜尋，以及評鑑等級快速過濾。
5. **婦幼生活圈互連導流**：與生育補助試算 (`/tools/maternity`)、托育托嬰據點 (`/tools/child-care`) 及母嬰親善醫院 (`/tools/baby-friendly-hospital`) 串聯，提供孕產至育兒的一站式指引。

---

## User Stories

1. As a pregnant woman preparing for childbirth, I want to find legally registered postpartum care centers near my residence using my phone's GPS location, so that I can conveniently tour and visit centers within a reasonable commute distance.
2. As an expectant mother, I want to see whether a postpartum care facility has passed the MOHW official evaluation (評鑑合格), so that I can entrust my post-delivery recovery to a certified and safe environment.
3. As an expectant parent, I want to view the official evaluation expiry date (合格效期), so that I know the certification is currently valid and not expired.
4. As a father comparing different postpartum centers, I want to see both the approved maternal bed count and infant crib count (產婦床數與嬰兒床數), so that I can gauge the facility size and ensure adequate nurse-to-infant ratios.
5. As a pregnant woman living in a specific county or township, I want to filter postpartum care centers by administrative district, so that I can explore all options across the entire metropolitan area.
6. As a user searching for a specific brand or facility by name (e.g., "晶英", "御兒軒"), I want instant keyword autocomplete and search filtering, so that I can quickly verify its legal licensing and location.
7. As a mobile user, I want an interactive map with zoomable clustering pins, so that I can visually grasp the geographical distribution of postpartum centers in my neighborhood.
8. As a parent viewing a facility card on mobile, I want a single-tap phone dial button, so that I can immediately call the postpartum center for inquiry and booking.
9. As a parent viewing a facility card, I want a direct Google Maps navigation link, so that I can plan transit or driving routes to visit the center.
10. As a cautious parent, I want to filter out uncertified facilities or view newly established ones tagged as "pending evaluation" (尚未評鑑), so that I can make an informed risk assessment.
11. As a new mother preparing for baby care, I want convenient navigation links from the postpartum care page to infant childcare services (`/tools/child-care`) and maternity subsidies (`/tools/maternity`), so that I can prepare for post-confinement parenting.
12. As a mother delivering at a certified baby-friendly hospital, I want to discover postpartum care centers located near my delivery hospital, so that postpartum transfer is seamless and low-stress.
13. As a user with slow or intermittent mobile internet, I want the page to load fast via static and cached metadata, so that I don't face white screens or slow network timeouts.
14. As an accessibility-focused user, I want full keyboard and screen reader accessibility on facility lists and filters, so that I can comfortably browse without barriers.
15. As a search engine bot, I want valid schema.org structured data (MedicalOrganization/LocalBusiness) and canonical links, so that pregnant mothers searching on Google can discover this public-good tool.

---

## Implementation Decisions

### 1. Data Ingestion Architecture & Entity Separation
- **Source Endpoint**: Data will be ingested from MOHW's "全國開業護理機構清冊" (`https://nhplatform.mohw.gov.tw/dl-3820-74883655f255416abc752bef29cbd7aa.html`).
- **Entity Bifurcation**:
  - Rows with `機構類別 === '產後護理之家'` (currently 241 institutions) are routed to the `facilities` database table with `facility_type = 'postpartum_care'`.
  - Non-postpartum institutions in the same file (501 一般護理之家 and 751 居家護理所) will be staged for subsequent ingestion into the existing `long_term_care` domain, adhering to the "one source, zero waste" strategy.
- **Coordinates & Robustness**:
  - The dataset provides native `WGS84經度` and `WGS84緯度` (99.9% coverage). The pipeline will ingest these directly, bypassing TGOS/geocoder quotas.
  - Ingestion must strip leading UTF-8 BOM (`\uFEFF`) and parse RFC-4180 compliant CSV to handle embedded commas in addresses.
  - A fallback seed file `data/seeds/postpartum-care-seed.json` will be generated to guarantee 100% SSR resilience against upstream connection timeouts.

### 2. Schema and Extra JSON Contract
- Facilities of type `postpartum_care` will populate standard columns:
  - `facility_type`: `'postpartum_care'`
  - `source_id`: 機構代碼 (e.g. `7411041101`)
  - `name`: 機構名稱
  - `address`: 定位地址 (fallback to 登錄地址)
  - `phone`: 機構電話
  - `city`: 縣市別
  - `category`: 評鑑結果 (e.g. `'合格'`, `'尚未評鑑'`)
  - `service_items`: Formatted bed summary (e.g. `'產婦床 18 床 · 嬰兒床 19 床'`)
- The `extra_json` column will store structured extension attributes:
  ```ts
  interface PostpartumExtraJson {
    postpartumBeds: number;
    babyBeds: number;
    evaluationResult: string;
    evaluationExpiry: string; // e.g. "117年12月31日"
    registeredAddress: string;
  }
  ```

### 3. Frontend Architecture & Shared Components
- **Framework Reuse**: Implemented using the existing `FacilitySearchContent` client component, eliminating custom map/list state management bugs and preserving UI consistency.
- **Configuration Registry**: Registered in `facilityConfigs.ts` under key `postpartum-care`:
  - Default search radius: 10,000 meters (10 km).
  - Category badges: `[{ value: "合格", label: "✅ 評鑑合格" }, { value: "尚未評鑑", label: "⏳ 新立案／待評鑑" }]`.
  - Service item label: `"🛏️ 核准床數："`.
- **Route & Catalog Registration**:
  - Route: `/tools/postpartum-care`
  - Category: `family` (婦幼與家庭)
  - Urgency: `normal`
  - Canonical URL, OpenGraph metadata, and JSON-LD breadcrumbs configured in accordance with site SEO guidelines.

---

## Testing Decisions

### What Makes a Good Test
Tests should verify observable behavior and contract boundaries rather than internal variables. Specifically:
- Given an upstream CSV snapshot containing varied institutional categories and malformed edge cases, the ingestion module correctly filters and transforms postpartum facilities.
- Bed numbers and evaluation dates are cleanly parsed into integers and trimmed strings.
- Outlier records with missing coordinates or invalid identifiers are safely rejected without throwing unhandled exceptions.

### Modules Tested
1. **Source Parser Module**: Unit tests verifying CSV transformation, BOM stripping, institutional filtering, and schema conformance against test fixture rows.
2. **Facility Search Integration**: Query tests verifying filtering by `postpartum_care` type and sorting by distance.

### Prior Art
- Follows the patterns established in `lib/server/facilities/sources/earlyInterventionShared.test.mjs` and `lib/server/facilities/csv.test.mjs`.

---

## Out of Scope

1. **Commercial Pricing and Package Rates**: Upstream government data does not include room rates or package prices; no scraping of private commercial booking platforms will be attempted.
2. **Live Vacancy / Available Rooms**: The dataset reflects certified licensed capacity (核准開放床數), not minute-by-minute real-time occupancy. The UI will explicitly display "核准床數" to prevent misunderstanding.
3. **User Reviews and Star Ratings**: No public commenting or subjective user rating system will be hosted to maintain strict neutrality and avoid defamatory liability.
4. **Direct Booking Engine**: The tool directs users to official phone numbers and addresses for direct communication; no transactional booking flow is in scope.

---

## Further Notes

- **Upstream Release Cycle**: MOHW updates dataset 115950 annually (or bi-annually on license renewals). A monthly scheduled cron runner will keep data synchronized.
- **Cross-Promotion**: The tool will feature bidirectional callout chips pointing between `/tools/maternity` (Maternity subsidies), `/tools/baby-friendly-hospital` (Baby-friendly hospitals), and `/tools/child-care` (Infant daycare centers).

