# Spec & Ticket: Sheltered Workshops Gift Boxes & Presidential Office Visit

- **Ticket ID**: `SPEC-HEALTH-20260910-SHELTERED-WORKSHOPS-AND-PRESIDENTIAL-VISIT`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Closes**: #186
- **Affects**:
  - `lib/server/npoOrganizations/queries.ts`
  - `app/api/npo-organizations/route.ts`
  - `app/tools/npo-organizations/NpoOrganizationsContent.tsx`
  - `data/sheltered-workshops.json`
  - `scripts/ingest-sheltered-workshops.mjs`
  - `lib/server/culture/ingestPresidentialVisit.ts`
  - `lib/server/cron/registerJobs.ts`
  - `app/api/admin/culture-sync/route.ts`
  - `lib/server/npoOrganizations/shelteredWorkshops.test.mjs`

---

## 1. Problem Statement

1. **Supporting Vulnerable Employment via Public Exposure**: Non-profit organizations and sheltered workshops (庇護工場) providing vocational opportunities for individuals with disabilities, mental health recovery, and disadvantaged backgrounds rely heavily on seasonal gift boxes and product sales (e.g. bakery goods, handmade soaps, festive gift sets). Prior to this update, organizations selling charity goods were mixed into thousands of general tax entities without visual priority or direct purchase links.
2. **National Heritage Landmark Exhibition Access**: The Presidential Office (`https://www.president.gov.tw/Page/124`) offers regular free public weekday visits and monthly open-house weekend exhibitions for national architecture and history. This key public civic attraction was missing from `/tools/cultural-events`.

---

## 2. Solution & Architectural Blueprint

### 2.1 Three-Tier Priority Ranking Architecture
In `lib/server/npoOrganizations/queries.ts`, both default and filtered queries order results by:
```sql
ORDER BY
  CASE
    WHEN extra_json->>'$.hasProducts' = 'true' THEN 1
    WHEN source_key = 'npo_tw' OR extra_json->>'$.npoCenterOrgid' IS NOT NULL THEN 2
    ELSE 3
  END ASC,
  id DESC
```
1. **Tier 1 (Top Priority)**: NPOs and sheltered workshops with active charity products (`hasProducts = true`).
2. **Tier 2**: Organizations cataloged from Taiwan NPO Center (`npo_tw`) with full addresses, contact details, and websites.
3. **Tier 3**: Standard Ministry of Finance tax-withholding entities.

### 2.2 62 Sheltered Workshops & Charity Products Ingestion
- Cleaned and decoded 62 sheltered workshops reported by Cichuan 118 (`https://www.cichuan118.com/blog/posts/sheltered-workshop-mid-autumn-gift-boxes`).
- Facebook redirect URLs (`l.facebook.com/l.php?u=...`) decoded to clean direct merchant/product URLs (e.g. `https://www.downdown.tw/`, `https://www.rakuten.com.tw/shop/cshop/category/g4bhj/`).
- Stored as authoritative dataset `data/sheltered-workshops.json`.
- Ingestion runner `scripts/ingest-sheltered-workshops.mjs`:
  - Enriches existing `facilities` matching normalized names with `hasProducts: true`, `storeUrl`, and product tags.
  - Inserts new sheltered workshop entities (`facility_type: 'npo'`) with city and direct store link.

### 2.3 UI & Filtering Upgrade (`/tools/npo-organizations`)
- Added toggle button **「🎁 僅看公益商品」** in filter toolbar.
- Cards render:
  - 🎁 **販售公益商品** badge.
  - 🎁 **前往商城/禮盒專區** direct action button for instant ordering.

### 2.4 Presidential Office Visit Ingestion (`/tools/cultural-events`)
- Created `lib/server/culture/ingestPresidentialVisit.ts` scraping `https://www.president.gov.tw/Page/124`.
- Upserts national heritage exhibition entry into `cultural_events`:
  - `uid = "gov_president_office_visit"`
  - `category = "exhibition"`
  - `title = "中華民國總統府 常態開放參觀與國定古蹟建築展覽"`
  - `city = "臺北市"`
  - `venue = "中華民國總統府 (重慶南路一段122號)"`
  - `price = "完全免費 (Free)"`
- Upserts weekday and weekend shows into `cultural_event_shows`.
- Scheduled in `lib/server/cron/registerJobs.ts` and supported in `app/api/admin/culture-sync/route.ts`.
