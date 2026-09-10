# Spec & Ticket: TGOS Primary Address Geocoder Integration

- **Ticket ID**: `SPEC-HEALTH-20260910-TGOS-PRIMARY-GEOCODER`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Closes**: #180
- **Affects**:
  - `lib/server/facilities/geocodeProviders.ts`
  - `lib/server/facilities/geocodeBudget.ts`
  - `lib/server/facilities/geocodeBatch.ts`
  - `lib/server/facilities/geocode.ts`
  - `lib/server/news/geoExtractor.ts`
  - `.env.example`
  - `.github/workflows/deploy-ftps.yml`
  - `scripts/gha-facilities-geocode-batch.mjs`
  - `scripts/test-geocode-batch.mjs`
  - `scripts/test-tgos-geocode.mjs`
  - `lib/server/facilities/tgosProvider.test.mjs`

---

## 1. Problem Statement

Across the application, forward address geocoding (converting Taiwanese street addresses into WGS84 coordinates) was handled by a cascade of:
1. Google Maps (unconfigured in production due to cost)
2. OpenCage Data (1,400 daily budget cap)
3. OpenStreetMap Nominatim (1,000 daily budget cap)
4. Local road-level database fallback (centroid of road)

### Core Limitations of Prior Architecture:
1. **Low Coverage on Granular Taiwan Addresses**: OpenCage and Nominatim are backed primarily by OpenStreetMap, which has low completeness on Taiwanese house numbers and alleyways (e.g. `79巷15號之8`). This forced queries to degrade via `buildQueryCandidates` to road level or fail entirely.
2. **Quota Waste & Cumulative Failures**: Batches routinely exhausted daily provider budgets on repeated failed attempts. Once facilities accumulated `geocode_attempts >= 3`, they were permanently abandoned by the daily batch runner (`MAX_GEOCODE_ATTEMPTS = 3`).
3. **News Article Geo-extraction Quality**: News stories reporting health alerts or events with street addresses often fell back to county or district centroids because OpenCage failed to resolve the street number.

---

## 2. Solution & Architectural Blueprint

### 2.1 Authoritative National Service: TGOS QueryAddr
Integrate the **Ministry of the Interior (MOI) TGOS (Taiwan Geospatial One-Stop) Address Geocoding Web API** (`https://addr.tgos.tw/addrws/v30/QueryAddr.asmx/QueryAddr`) as the **system-wide primary (#1 priority) geocoder**.

TGOS is maintained by the National Land Surveying and Mapping Center (NLSC) and possesses the authoritative national cadastral and doorplate registry, delivering pinpoint coordinate accuracy for full addresses.

### 2.2 System-wide Priority Cascade
Across all 3 geocoding entry points:
```text
TGOS (primary, 5,000/day)
  └── OpenCage key1 (1,400/day)
        └── OpenCage key2 (if configured, 1,400/day)
              └── Nominatim (1,000/day)
                    └── Local road-level centroid fallback (facilities batch only)
```

1. **Facilities Scheduled Batch** (`lib/server/facilities/geocodeBatch.ts`):
   - `geocodeOneAddress`: Queries TGOS first for candidate 0 (full normalized address).
   - High initial match rate drastically reduces OpenCage/Nominatim calls and preserves secondary budgets.
2. **Facility Single/Admin Geocode** (`lib/server/facilities/geocode.ts`):
   - `geocodeAddress`: Prioritizes TGOS before Google/OpenCage/Nominatim.
3. **News Location Extraction** (`lib/server/news/geoExtractor.ts`):
   - Tier 4 geocoding queries TGOS first for recognized street addresses.

---

## 3. Implementation Details

### 3.1 Credential & Variable Compatibility
- Supports both `TGOS_APP_ID` and `TGOS_APPID` (without underscore) alongside `TGOS_API_KEY`.
- Documented in `.env.example`.
- Configured secret forwarding in `.github/workflows/deploy-ftps.yml` (`TGOS_APP_ID_SECRET`, `TGOS_API_KEY_SECRET`).

### 3.2 Provider Engine (`lib/server/facilities/geocodeProviders.ts`)
- **Rate Limiting**: `throttleTgos = rateLimiter(300)` enforcing ~3.3 req/sec to prevent upstream throttling.
- **ASMX SOAP/GET Protocol**: Full query parameters populated:
  - `oSRS=EPSG:4326` (direct WGS84, avoiding proj4 reprojection)
  - `oResultDataType=JSON`
  - `oFuzzyType=0`, `oFuzzyBuffer=0`, `oIsOnlyFullMatch=false`
  - Full set of `oIsLock*` constraints set to `"false"`.
- **Response Handling**:
  - Unwraps ASMX XML wrapper: `<string xmlns="http://tempuri.org/">...</string>`.
  - Detects quota exhaustion keywords (`額度已滿`, `超過次數`) -> `{ kind: "quota_exceeded" }`.
  - Encapsulates authorization/IP errors (`認證授權失敗:應用程式IP不正確`) safely as `{ kind: "error" }` without crashing, enabling clean fallback.
  - Coordinate extraction (`AddressList[0].Y` -> lat, `AddressList[0].X` -> lng).
  - Geographic sanity check via `isWithinTaiwanBounds(lat, lng)`.

### 3.3 Daily Budget & Circuit Breaker (`lib/server/facilities/geocodeBudget.ts`)
- Added `tgos` provider to `GeocodeProvider` enum.
- Configured `DAILY_BUDGET.tgos = 5000`.
- Integrated with `loadGeocodeBudgetState`, `recordGeocodeRequest`, and `tripCircuitBreaker` in MySQL table `geocode_provider_budget`.
- Introduced `isAllProvidersCapacityExhausted(state)`.

### 3.4 One-Time Backfill Reset (`lib/server/facilities/geocodeBatch.ts`)
- Defined `RESET_FLAG_KEY = "geocode_attempts_reset_tgos_v1"` in `geocode_backfill_flags`.
- Automatically resets `geocode_attempts = 0` for all unlocated facilities (`lat IS NULL`), giving previously failed facilities an immediate chance to be accurately positioned by TGOS.

---

## 4. Verification & Testing

### 4.1 Unit Testing
- `lib/server/facilities/tgosProvider.test.mjs` (6/6 passing):
  - Boundary validation (Taipei, Kaohsiung, offshore islands vs. international coordinates).
  - Budget cap and circuit breaker behavior.
  - Combined `isAllProvidersCapacityExhausted` logic.
  - XML-wrapped JSON payload extraction and quota/auth error detection.
- `scripts/test-geocode-batch.mjs` (28/28 passing):
  - Validates full provider exhaustion arithmetic, address deduplication, and all 22 priority source configurations.
- Overall repository test suite: `npm test` (150/150 passing).
- Type checking: `npm run typecheck` (`tsc --noEmit`) passes with 0 errors.

### 4.2 End-to-End Connectivity Verification
- Provided `scripts/test-tgos-geocode.mjs`.
- Verified live HTTP response from `https://addr.tgos.tw` in ~400ms.
- Verified graceful fallback behavior when client IP is outside TGOS whitelist.
