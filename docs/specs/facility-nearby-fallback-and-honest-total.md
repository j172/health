# Spec & Ticket: Facility Nearby-Fallback & Honest Record Total

- **Ticket ID**: `SPEC-HEALTH-20260829-FACILITY-FALLBACK-TOTAL`
- **Status**: TODO
- **Priority**: HIGH (P1)
- **Affects**: `components/Facilities/FacilitySearchContent.tsx`, `app/api/facilities/route.ts`, `lib/server/facilities/queries.ts`, `app/tools/facilityConfigs.ts`

---

## 1. Problem Statement & Root Cause

### Symptom
`/tools/hakka-bogong` looks like it holds almost no data. Opening it from Taipei renders a list of 4 rows under the caption `共 4 筆`, which reads as "this dataset contains 4 records".

### Measured Facts (2026-08-29)

Source dataset `https://cloud.hakka.gov.tw/Pub/Opendata/DTST20230600002.json` holds **611 rows**, concentrated in the Hakka belt:

```
桃園市 134   苗栗縣 129   新竹縣 84   南投縣 49   屏東縣 48   高雄市 29
花蓮縣  29   新竹市  26   臺南市 26   臺中市 23   雲林縣 18   臺東縣 14
臺北市   1   宜蘭縣   1
```

Production holds ~555-590 of them and **essentially 100% are geocoded** — a nationwide GPS query returns the same per-county counts as a keyword query.

Default page load from three cities (10km radius, the real default):

```
伯公照護站   @台北車站  4    @中壢 31   @新竹 48
兒少福利中心 @台北車站 11    @中壢  1   @新竹  0
```

### Root Causes

1. **The nearby search silently becomes the whole story.** `FacilitySearchContent.tsx` sends `lat`/`lng`/`radius` whenever there is no keyword, and `searchFacilities` then adds `lat IS NOT NULL AND lng IS NOT NULL` plus `HAVING distance_km <= ?`. A user outside the data's geographic concentration sees a near-empty page with no signal that the dataset is large.
2. **The record counter is misleading.** `FacilitySearchContent.tsx` renders `共 {facilities.length} 筆`, i.e. the length of a radius-filtered, `LIMIT 200`-truncated result set, presented in the same words a dataset size would use.
3. **`child-welfare-centers` genuinely holds only 37 rows** — the MOHW CSV `兒童及少年福利服務中心一覽表` is 38 lines including its header, so the site's 37 is a complete import. The tool's copy does not say the dataset only covers 公設民營 service centers and excludes 安置及教養機構, so the sparse result reads as a bug.

---

## 2. Agreed Architectural Blueprint

### 2.1 Nearby-Fallback (`FacilitySearchContent.tsx`)

When a keyword-less GPS search returns **0 rows**, re-query **with the same `lat`/`lng`** and a widened radius (500km, i.e. `radius=500000`) instead of dropping the coordinates.

- Keeping `lat`/`lng` preserves `ORDER BY distance_km ASC`, so the fallback list is "the nearest stations, whatever the distance".
- Dropping `lat`/`lng` would fall back to `ORDER BY name ASC` and hand a Taipei user 200 alphabetically-first associations in Miaoli. **Do not do this.**
- Requires no backend change: `/api/facilities` already accepts `radius`.

Fallback-state copy must state both the failed radius and the nearest hit, e.g.
`您附近 10 公里內沒有伯公照護站，以下依距離列出最近的站點（最近一處約 62 公里）。`

Render this notice above the list whenever the fallback is active. The existing `emptyStateNoKeyword` copy then only appears when the widened query *also* returns nothing.

### 2.2 Honest Total (`queries.ts` + `route.ts` + `FacilitySearchContent.tsx`)

- Add `countFacilities(facilityType: string): Promise<number>` to `lib/server/facilities/queries.ts`, running `SELECT COUNT(*) FROM facilities WHERE facility_type = ?`. This is an index-only scan on the existing `KEY idx_facility_type (facility_type)` (`lib/server/db/schema.ts`).
- `GET /api/facilities` returns `{ facilities, total }`.
- **`total` takes only `facility_type`.** It must ignore `keyword`, `lat`/`lng`, `radius`, `category` and `sort`, so that a keyword search reads `顯示 120 筆／全台共 611 筆` rather than `共 120 筆／共 120 筆`.
- Replace the `共 {facilities.length} 筆` line with `顯示 {facilities.length} 筆／全台共 {total} 筆`.

### 2.3 Scope Copy (`facilityConfigs.ts`)

Append a scope qualifier to the `child-welfare-centers` `description`:

> 本表為衛生福利部公告之公設民營兒少福利服務中心，不含安置及教養機構。

---

## 3. Explicit Non-Goals

- **Do not** expose `limit` as an `/api/facilities` query parameter. The list stays capped at 200; past row 200 of a distance-sorted list nothing is useful to the reader.
- **Do not** add or change any facility data. `child-welfare-centers`' 37 rows are correct and complete.
- **Do not** special-case `hakka-bogong`. The fallback is a defect in the shared component and must benefit all 18 `facilitySearchConfigs` entries.

---

## 4. Verification & Quality Assurance

- `npm run typecheck` returns 0 errors.
- `npm run lint` passes.
- `npm run build` succeeds.
- `/tools/hakka-bogong` from a Taipei coordinate shows the fallback notice plus a distance-ordered list, and the total reads ~611.
- `/tools/child-welfare-centers` total reads 37 and the description carries the scope qualifier.
- A keyword search shows a `顯示 N 筆` that differs from `全台共 M 筆`.
- `/tools/clinics` and `/tools/pharmacies` (dense datasets, GPS hit on first try) are unchanged — no fallback notice.
