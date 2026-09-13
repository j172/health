# SPEC-HEALTH-20260913-MOL-OCCUPATIONAL-INJURY-SOURCE-ID-MIGRATION

## 1. Context & Motivation (Issue #21)
- **Problem**: `lib/server/facilities/sources/molOccupationalInjuryHospital.ts` keyed `facilities.source_id` on the MOL dataset's raw row order (`序號`, values 1..39). If the upstream open data source ever prepends, deletes, or reorders records, existing facility rows in the database would be silently overwritten or matched against the wrong hospital institution, since `(source_key, source_id)` forms the unique upsert constraint `uq_facility_source`.
- **Solution**:
  1. Migrate `sourceId` formulation to a deterministic, stable compound key: `${r.醫療機構名稱}|${cleanAddress}`.
  2. Implement an idempotent, zero-downtime database migration in `initDb()` (`lib/server/db/mysql.ts`) to re-key existing production rows in-place, preserving existing geocoded `lat`/`lng` coordinates and avoiding orphan records.

## 2. Technical Design

### 2.1 Ingestion Key Generation
In `lib/server/facilities/sources/molOccupationalInjuryHospital.ts`:
```typescript
const cleanAddress = normalizeAddress(withCountyPrefix(r.直轄市或省轄縣市 || "", r.地址 || ""));
const sourceId = `${r.醫療機構名稱}|${cleanAddress}`.slice(0, 100);
```
- Ensures non-empty, unique identifiers for all 39 network hospitals.
- Truncates safely to 100 characters to fit `VARCHAR(100)` column length.

### 2.2 In-Place Database Migration
In `lib/server/db/mysql.ts` inside `initDb()`:
```sql
UPDATE facilities
SET source_id = SUBSTRING(CONCAT(name, '|', COALESCE(address, '')), 1, 100),
    updated_at = NOW()
WHERE source_key = 'mol_occupational_injury'
  AND source_id REGEXP '^[0-9]+$';
```
- Targets exclusively rows for source `mol_occupational_injury` that still carry legacy numerical sequence keys.
- Idempotent: rows already migrated will not match `^[0-9]+$` and will result in 0 rows affected on subsequent runs.
- Preserves all existing `lat`, `lng`, and `extra_json` fields.

## 3. Verification Strategy
1. Automated unit test `lib/server/facilities/sources/molOccupationalInjuryHospital.test.mjs`.
2. Full regression test suite (`npm test`).
3. Static type check (`npm run typecheck`).
