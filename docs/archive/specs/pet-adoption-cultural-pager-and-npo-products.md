# Spec & Ticket: Pet Adoption Auto-Seed, Cultural Events Pager (30/50/100), and 62 NPO Charity Product Organizations

- **Ticket ID**: `SPEC-HEALTH-20260911-PET-ADOPTION-CULTURAL-PAGER-NPO-PRODUCTS`
- **Priority**: CRITICAL (P0)
- **Status**: IMPLEMENTED
- **Affects**:
  - `components/Activities/CulturalEventsContent.tsx`
  - `data/pet-adoptions-seed.json`
  - `data/sheltered-workshops.json`
  - `lib/server/db/mysql.ts`
  - `lib/server/npoOrganizations/queries.ts`
  - `lib/server/npoOrganizations/enrichNpoSources.ts`
  - `scripts/ingest-sheltered-workshops.mjs`
  - `scripts/ingest-pet-adoptions.mjs`
  - `app/api/pet-adoptions/route.ts`

---

## 1. Problem Statement

1. **毛孩認領養查詢無資料 (`/tools/pet-adoption`)**:
   - Production database table `pet_adoptions` had 0 rows because ingestion was not scheduled on deployment and there was no seed data bundled in `ensureSchema()`.
   - Users visiting `/tools/pet-adoption` saw an empty list instead of animals available for adoption.

2. **文化活動缺少分頁器 (`/tools/cultural-events`)**:
   - The cultural events page fetched and rendered all hundreds of events in a single unpaginated vertical list.
   - User explicitly requested a pager with page size choices of 30, 50, and 100 (`要PAGGER 30 50 100`).

3. **公益組織名錄缺 62 家商品販售協會 (`/tools/npo-organizations`)**:
   - The user provided a 62-item list of sheltered workshops and charity organizations selling merchandise.
   - Investigation revealed:
     - `data/sheltered-workshops.json` had 61 items (missing item 56: `社團法人台灣技職教育產學研合作發展協會`, and item 57 had incorrect address).
     - Previous ingestion failed with `Duplicate entry 'sheltered_workshop-8'` because fuzzy matching failed to identify existing rows and tried to insert duplicate `source_id` without `ON DUPLICATE KEY UPDATE`.
     - 43 of the enriched sheltered workshops had `facility_type = 'disability_welfare'` from earlier government imports, but `lib/server/npoOrganizations/queries.ts` strictly filtered `facility_type IN ('npo', 'tax_organization')`, hiding 41+ workshops from the NPO directory.

---

## 2. Solution & Architectural Blueprint

### 2.1 Cultural Events Pager (30 / 50 / 100)
- Integrated standardized `usePagination` hook and `Pagination` component:
  - Page sizes: `30` (default), `50`, `100`.
  - Pagination state synchronizes with URL query params (`?page=1&pageSize=30`).
  - Active page resets to 1 whenever category tab, keyword, city, or time filter changes.
  - Slices `filteredItems` into `paginatedItems = filteredItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)`.
  - Header status bar displays: `顯示第 X - Y 檔（共 Z 檔最新藝文展演活動）`.
  - Smoothly scrolls to the top of the list when changing pages or page sizes.

### 2.2 Complete 62 Sheltered Workshops & NPO Expansion
- Expanded `data/sheltered-workshops.json` to exactly 62 items:
  - Added #56: `社團法人台灣技職教育產學研合作發展協會` (臺中市大里區東榮路35巷20之3號, 04-26805153, 24.10372, 120.68651).
  - Fixed #57: `社團法人屏東縣自閉症協進會` (屏東縣屏東市建豐路180巷35號5樓, 08-7351024, 22.67812, 120.50541).
- Updated `lib/server/npoOrganizations/queries.ts`:
  - Broadened `facility_type IN ('npo', 'tax_organization', 'disability_welfare')` across all queries (`getRecentNpoOrganizations`, `countNpoOrganizations`, `searchNpoOrganizations`, `countSearchNpoOrganizations`, `getNpoOrganizationCities`).
  - Guaranteed inclusion: Any facility with `hasProducts = true` is always surfaced.
- Updated `scripts/ingest-sheltered-workshops.mjs`:
  - Added lookup by `(source_key = 'sheltered_workshop' AND source_id = ?)` prior to fuzzy match.
  - Added `ON DUPLICATE KEY UPDATE` to avoid duplicate key exceptions.
- Updated `lib/server/db/mysql.ts`:
  - In `ensureSchema()`, auto-seeds / syncs all 62 sheltered workshops on startup.

### 2.3 Pet Adoption Live Ingestion & Seed Resilience
- Executed live ingestion from MOA open data API (`85903`), populating 8,333 animals in production DB.
- Created `data/pet-adoptions-seed.json` with 150 valid real pet records (with photos and shelter contact info).
- In `lib/server/db/mysql.ts`, `ensureSchema()` auto-seeds from `data/pet-adoptions-seed.json` if `pet_adoptions` table is empty.
- In `app/api/pet-adoptions/route.ts`, if `totalAll === 0`, gracefully reads from seed file as a dynamic fallback.

---

## 3. Verification & Metrics

1. `curl https://health.j172.tw/api/pet-adoptions`: Returns 8,333 items with full images and shelter data.
2. `https://health.j172.tw/tools/cultural-events`: Pager renders `30`, `50`, `100` options, paginating items properly.
3. `https://health.j172.tw/tools/npo-organizations`: Filter `[🎁 僅看公益商品]` displays all 62 sheltered workshops and charity organizations with direct purchase links.
