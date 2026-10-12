# Spec & Ticket: NPO Organizations Directory & Enrichment

- **Ticket ID**: `SPEC-HEALTH-20260910-NPO-ORGANIZATIONS-DIRECTORY`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Closes**: #184
- **Affects**:
  - `next.config.mjs`
  - `lib/server/tools/catalog.ts`
  - `app/tools/page.tsx`
  - `locales/en.json`
  - `lib/server/npoOrganizations/queries.ts`
  - `lib/server/taxOrganizations/queries.ts`
  - `app/api/npo-organizations/route.ts`
  - `app/api/tax-organizations/route.ts`
  - `app/tools/npo-organizations/page.tsx`
  - `app/tools/npo-organizations/NpoOrganizationsContent.tsx`
  - `app/tools/tax-organizations/page.tsx`
  - `scripts/ingest-npo-organizations.mjs`
  - `lib/server/npoOrganizations/npoParser.test.mjs`

---

## 1. Problem Statement

Historically, public sector non-profit information on health.j172.tw under `/tools/tax-organizations` was populated strictly from the Ministry of Finance (MOF) Tax Bureau tax-withholding entities (`BGMOPEN99.csv`). While this provided 8-digit Unified Business Numbers (統編) and general city locations, it suffered from:
1. **Lack of Detailed Physical Addresses**: Most tax records provided only the city/county name or an incomplete office address, precluding pinpoint map navigation.
2. **Missing Contact Details & Websites**: Public visitors could not call organizations or visit official websites directly.
3. **No Social Welfare Attributes**: No distinction between elder care, disability welfare, child protection, ecological protection, or general civic services.
4. **Outdated Tool Scope**: Labeled merely as "機關團體扣繳單位" (Tax Withholding Units) instead of a comprehensive "全台公益組織 (NPO) 查詢名錄".

---

## 2. Solution & Architectural Blueprint

### 2.1 Tool Scope & Routing Migration
- **New Slug**: `/tools/npo-organizations` with title `全台公益組織 (NPO) 查詢` and icon `🤝`.
- **Legacy Route Redirection**: `next.config.mjs` configures an HTTP 301 permanent redirect from `/tools/tax-organizations` to `/tools/npo-organizations`.
- **Catalog & Navigation**: Update `lib/server/tools/catalog.ts`, `app/tools/page.tsx`, and `locales/en.json`.
- **API Unification**: Dedicated endpoint at `/api/npo-organizations`, while `/api/tax-organizations` transparently proxies/forwards to preserve legacy consumer compatibility.

### 2.2 Dual-Stage Smart Deduplication & Enrichment
- **Stage 1 (Cross-System Matching)**:
  - Normalize organization names (strip legal prefixes such as `社團法人`, `財團法人`, full/half-width brackets and spaces).
  - Match against existing records in `facilities` where `facility_type IN ('npo', 'tax_organization')` via BAN (統編) or normalized name.
  - Upon match: enrich existing records with precise street address, phone number, official website, contact person, supervisor agency, and organization attribute tags (`orgAttribute`).
- **Stage 2 (Branch & Entity Distinction)**:
  - If an NPO has multiple branches or service centers in different cities or with different `orgid` values, they are retained as distinct physical branch entities (`source_key: 'npo_tw', source_id: orgid`).

### 2.3 Address & Coordinates Geocoding
- Complete physical address is extracted from NPO Center detail pages (`811高雄市楠梓區大學三十街25號1樓`).
- If an address is absent in the directory, fall back to registered agency records.
- Records with valid street addresses enter the system; coordinates are smoothly resolved by the established GitHub Actions TGOS / OpenCage batch geocoder (5,000 queries/day quota) without blocking import or risking API exhaustion.

### 2.4 Website Normalization & Search Enrichment
- **Tier 1**: Extract the official website URL submitted to NPO Center (`https://www.gaodahome.org/`). Sanitize invalid strings (e.g., "無", "暫無", "同上").
- **Tier 2 (Search Enrichment)**: For organizations lacking a website on NPO Center, perform targeted search probing ("組織名稱 + 官網/Facebook") to discover verified domain or Facebook fan page, storing results in `extra_json.website` and marking `extra_json.website_source`.

### 2.5 Modernized UI & Filter Capabilities
- Multi-dimensional filters:
  - Keyword search (name, BAN, contact).
  - 22 Taiwan administrative cities/counties.
  - **Organization Attribute filter** (`老人福利`, `身心障礙`, `兒童青少年`, `環境保護`, `綜合性服務` etc.).
- Upgraded Actionable Cards:
  - Organization Name + Attribute Badge + City Badge.
  - 🌐 **Official Website Link**: Direct external link with clean hostname badge.
  - 📞 **One-click Phone Call**: Clickable `tel:` button.
  - 📍 **Full Address & Google Maps Navigation**: Direct map link.
  - Summary accordion (Key focus, service items, unified business number).

---

## 3. Ingestion & Maintenance Script (`scripts/ingest-npo-organizations.mjs`)

- **Resilient Crawler**:
  - Crawls all 457 pages of `https://www.npo.org.tw/npolist.aspx?tid=146` (~7,850 records).
  - Polite concurrency (3-5 concurrent workers with rate limiting) to prevent IP throttling or 429/503 errors.
  - Built-in checkpointing (`.npo-checkpoint.json`) to allow seamless resumption if interrupted.
- **Weekly Incremental Sync**:
  - Checks the first 5 pages to ingest newly registered NPOs on a weekly maintenance schedule.

---

## 4. Verification & Testing

- Unit tests in `lib/server/npoOrganizations/npoParser.test.mjs`:
  - Name normalization (stripping `社團法人`, `財團法人`, brackets).
  - NPO Center detail page field extraction (address, phone, website, attributes).
  - Website URL sanitization and validation.
- End-to-end API tests for `/api/npo-organizations` and legacy alias `/api/tax-organizations`.
- Full TypeScript compilation (`npx tsc --noEmit`).
