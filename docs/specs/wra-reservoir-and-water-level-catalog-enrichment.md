# Spec & Ticket: WRA Reservoir and Water Level Station Catalog Enrichment with Fancy SVG Gauges

- **Ticket ID**: `SPEC-HEALTH-20260909-WRA-CATALOG-ENRICHMENT`
- **Priority**: HIGH (P1)
- **Closes**: #172
- **Affects**:
  - `lib/server/db/schema.ts`, `lib/server/db/mysql.ts`
  - `lib/server/wra/fetchReservoirCatalog.ts`, `lib/server/wra/fetchWaterLevelStationCatalog.ts`, `lib/server/wra/catalogQueries.ts`
  - `lib/server/wra/reservoirQueries.ts`, `lib/server/wra/waterLevelQueries.ts`, `lib/server/wra/runSync.ts`
  - `app/api/wra-reservoir-status/route.ts`, `app/api/wra-water-level/route.ts`
  - `app/api/admin/wra-catalog-sync/route.ts`, `scripts/import-wra-catalogs.mjs`, `lib/server/cron/registerJobs.ts`
  - `components/Tools/ReservoirWaterTankGauge.tsx`, `components/Tools/WaterLevelStaffGauge.tsx`
  - `app/tools/reservoir-status/ReservoirStatusContent.tsx`, `app/tools/water-level-stations/WaterLevelStationsContent.tsx`

---

## 1. Problem Statement

Issue #135 introduced the WRA (經濟部水利署) open-data telemetry:
- `/tools/reservoir-status`: 水庫即時營運狀況
- `/tools/water-level-stations`: 全台水位站即時水位

However, the telemetry feeds publish **only raw numeric/alphanumeric identification codes** (`reservoiridentifier` e.g. `10205` / `50303`, and `stationid` e.g. `1010H006`), with no Chinese names, river basins, or geographic context. Both tools displayed warning notices ("⚠️ 來源資料未提供中文名稱，以代碼標示"), severely hurting readability and searchability.

Furthermore, numeric water level readings had no visual context (e.g., how close a station is to flood alert thresholds, or a reservoir's water storage level).

---

## 2. Solution & Architectural Blueprint

### 2.1 Dual Open Datasets Integration
1. **水庫代碼表** (data.gov.tw [dataset/139336](https://data.gov.tw/dataset/139336), WRA API `f65a2148-9c7a-4e16-acaf-48917a5124e2`):
   - Supplies `水庫代碼`, `水庫名稱`, `河川名稱`, `鄉鎮名稱`, `行政區域代碼`.
2. **河川水位測站站況** (data.gov.tw [dataset/22227](https://data.gov.tw/dataset/22227), WRA API `c4acc691-7416-40ca-9464-292c0c00da92`):
   - Supplies `basinidentifier` (station id), `observatoryname` (station name), `rivername`, `locationaddress`, `alertlevel1` (一級警戒水位), `alertlevel2` (二級警戒水位), `alertlevel3` (三級警戒水位), `affiliatedbasin`, `areacode`.

### 2.2 Dedicated Database Catalog Tables
Following this repository's normalization pattern, metadata is stored in dedicated reference tables:
- `wra_reservoirs` (`reservoir_id` UNIQUE PK, `reservoir_name`, `river_name`, `town_name`, `area_code`, timestamps).
- `wra_water_level_stations` (`station_id` UNIQUE PK, `station_name`, `observatory_identifier`, `river_name`, `location_address`, `alert_level_1`, `alert_level_2`, `alert_level_3`, `basin_code`, `area_code`, `observation_status`, timestamps).
- Automatically created via `TABLE_DDL` and `ensureSchema()` in `lib/server/db/mysql.ts`.

### 2.3 Query & Multi-Field Search with Regional Filters
- `getLatestReservoirStatusPage`:
  - `LEFT JOIN wra_reservoirs c ON c.reservoir_id = r.reservoir_id`
  - Keyword search matches `reservoir_id`, `reservoir_name`, `river_name`, `town_name`.
  - Region filter matches region prefixes: `10` (北部), `20` (中部), `30` (南部), `40` (東部), `50` (離島).
- `getLatestWaterLevelReadingsPage`:
  - `LEFT JOIN wra_water_level_stations c ON c.station_id = r.station_id`
  - Keyword search matches `station_id`, `station_name`, `river_name`, `location_address`.
  - Region filter matches basin codes and counties (北部, 中部, 南部, 東部, 離島).

### 2.4 Cold-Start Auto-Seeding & Sync Scheduling
- `ensureCatalogsSeeded()`: Checks if either catalog table is empty (0 rows); if so, seeds it in the background immediately so first-time requests resolve names without waiting for a cron run.
- Cron: Scheduled in `lib/server/cron/registerJobs.ts` at 04:30 AM daily (`30 4 * * *`).
- Manual Trigger: Admin route `/api/admin/wra-catalog-sync` (authenticated via `x-rss-sync-admin-secret`) and CLI script `scripts/import-wra-catalogs.mjs`.

### 2.5 Fancy SVG Visualizations
- **Reservoir Water Tank Gauge (`components/Tools/ReservoirWaterTankGauge.tsx`)**:
  - Realistic glassmorphism water tank with dynamic gradient wave surface (`#06b6d4` to `#2563eb`).
  - Ruler ticks, glass sheen highlight, and instant display of water level (m) and effective capacity (萬m³).
- **Water Level Staff Gauge (`components/Tools/WaterLevelStaffGauge.tsx`)**:
  - Flood staff ruler (防汛水尺規) with metric tick marks and dynamic water level needle.
  - Distinct colored threshold indicator lines for Alert Level 3 (Amber), Alert Level 2 (Orange), Alert Level 1 (Red).
  - Dynamic status badge: When current water level >= alert level, triggers color badges and animated pulse glow (`🚨 一級警戒`, `⚠️ 二級警戒`, `⚡ 三級警戒`).

---

## 3. Explicit Non-Goals
- Do not mutate or overwrite raw historical telemetry readings in `wra_reservoir_status` and `wra_water_level_readings` (they remain pure time-series sensor observations).
- Do not drop records whose codes are absent in the catalog (gracefully fallback to "未具名水庫/測站" with the original code).
- Do not add heavy external charting dependencies; all visual gauges are built purely with lightweight, accessible SVG.

---

## 4. Verification & Quality Gates
- `npm test`: 144 unit tests pass, including parser and alert threshold tests in `lib/server/wra/catalogs.test.mjs`.
- `npm run typecheck`: 0 TypeScript errors.
- `npm run lint`: 0 ESLint errors.
- `npm run build`: Next.js Turbopack production build succeeds with all dynamic routes rendered.
