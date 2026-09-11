# Spec & Ticket: Tool Data Sources Fallback and Automated Sync Resilience

- **Ticket ID**: `SPEC-HEALTH-20260911-TOOL-DATA-SOURCES-FALLBACK`
- **Priority**: CRITICAL (P0)
- **Status**: IMPLEMENTED
- **Affects**:
  - `app/api/facilities/route.ts`
  - `app/api/heritage-map/route.ts`
  - `data/facilities-seeds/tourism_factory.json`
  - `data/facilities-seeds/bookstore.json`
  - `data/heritage-map-seed.json`
  - `lib/server/facilities/geocodeBatch.ts`
  - `scripts/run-six-monthly-sync.sh`
  - `.github/workflows/six-monthly-sync.yml`
  - `scripts/build-facility-seeds.mjs`
  - `scripts/verify-tool-sources.test.mjs`
  - `package.json`

---

## 1. Problem Statement

1. **觀光工廠無資料 (`/tools/tourism-factories`)**:
   - `https://health.j172.tw/tools/tourism-factories` showed an empty list (`{"facilities":[],"total":0}`).
   - Although `scripts/import-ida-tourism-factories.mjs` was created in PR #194, it was never executed in production, and no seed fallback existed in the app.
   - The official Ministry of Economic Affairs (IDA) CSV dataset (`SDD6848.csv`) lacks coordinates (`lat: null, lng: null`), which prevented direct spatial indexing.

2. **全站 57 項工具消息與資料來源稽核 (Site-wide Data Sources Audit)**:
   - Thorough inspection of all 57 tools in `TOOL_CATALOG` identified two other pages with zero records on production:
     - `/tools/bookstores` (全國實體書店): 0 rows in production DB; script `scripts/import-moc-bookstores.mjs` was not yet in automated workflows.
     - `/tools/heritage-map` (文化資產地圖): `heritage_assets` table has 0 points in production because the semi-annual sync had not executed since feature introduction.
   - The remaining 54 tools (12 health calculators, 9 live weather/disaster monitors, 6 TFDA food/drug registries, and other facility tools) are functioning with live data.

---

## 2. Solution & Architectural Blueprint (Dual-Layer Protection)

### 2.1 Layer 1: Universal Seed Fallback in `/api/facilities` & `/api/heritage-map`
- **Universal Facility Seed Engine (`app/api/facilities/route.ts`)**:
  - When database query yields `total === 0` or fails due to network/database downtime, automatically checks `data/facilities-seeds/${facilityType}.json`.
  - Performs in-memory filtering: keyword search, category filter, charity filter.
  - Implements Haversine distance calculations and sorting when GPS `lat`/`lng` are provided.
  - Preserves pagination and API contract with the frontend `FacilitySearchContent` component.
- **Offline Coordinate Resolution (`scripts/build-facility-seeds.mjs`)**:
  - Pre-geocodes all 158 IDA certified tourism factories using Taiwan county/district centroid mapping.
  - Pre-geocodes all 660 MOC physical bookstores (552 with high-precision coordinates).
  - Normalizes 1,063 MOC/BOCH cultural heritage assets into `data/heritage-map-seed.json`.

### 2.2 Layer 2: Automated Production Ingestion & Geocoding Rotation
- **Semi-Annual Sync Integration (`.github/workflows/six-monthly-sync.yml`)**:
  - Added runner steps to execute `import-ida-tourism-factories.mjs` and `import-moc-bookstores.mjs`.
  - Supports `workflow_dispatch` for manual single-click trigger.
- **Geocode Batch Prioritization (`lib/server/facilities/geocodeBatch.ts`)**:
  - Registered `tourism_factory` (`ida_tourism_factory`) and `bookstore` (`moc_bookstore`) into `SOURCES_IN_PRIORITY` and `scripts/run-six-monthly-sync.sh` `COMBOS`.

### 2.3 Automated Regression Prevention
- **Test Suite (`scripts/verify-tool-sources.test.mjs`)**:
  - Validates that all 57 tools in `TOOL_CATALOG` have either live connections, valid bundled seed data, or standalone client algorithms.
  - Integrated into `npm test`.

---

## 3. Verification & Results

1. **Local Endpoint Tests (Offline / Zero-DB simulation)**:
   - `GET /api/facilities?type=tourism_factory`: HTTP 200, 158 factories, full coordinates, keyword search (基隆 -> 一太e衛浴), and GPS distance ordering.
   - `GET /api/facilities?type=bookstore`: HTTP 200, 660 bookstores.
   - `GET /api/heritage-map`: HTTP 200, 1,063 heritage points.
2. **Automated Tests**:
   - `npm test`: 173 tests passed, 0 failed.
   - `npm run typecheck`: 0 errors.
   - `npm run build`: Next.js Turbopack 60 routes compiled successfully.

---

## 4. Production Deployment Hardening: Static JSON Bundle Ingestion

### 4.1 Discovery during Initial Production Verification
During live verification of PR #201 on `https://health.j172.tw/api/facilities?type=tourism_factory`, the endpoint initially returned `{"facilities":[],"total":0}`.
- **Root Cause**: In `.github/workflows/deploy-ftps.yml`, the build pipeline packages only `.next3` into `.prebuilt-next3.tgz` and `public/` into `.prebuilt-public.tgz`. The repository's `data/` directory is **not** uploaded to the host filesystem.
- Consequently, runtime `fs.existsSync(path.join(process.cwd(), "data", ...))` calls on the production host evaluated to `false`.

### 4.2 Architectural Fix
- API routes (`/api/facilities`, `/api/heritage-map`, `/api/pet-adoptions`) statically `import` their seed JSON files.
- Next.js / Webpack compiles these JSON modules directly into the server route bundle chunks in `.next3/server/app/api/...`.
- **Result**: Zero runtime filesystem dependency, instant fallback even if the server lacks a `data/` directory, and full resilience against external API network timeouts or unseeded database states.

