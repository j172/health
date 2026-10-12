# Spec & Ticket: Expand TAIWAN_DISTRICT_COORDINATES from 122 to all 368 Districts

- **Ticket ID**: `SPEC-HEALTH-20260829-DISTRICT-368`
- **Status**: TODO
- **Priority**: MEDIUM (P2)
- **Affects**: `lib/server/news/data/taiwanDistricts.ts`, new `scripts/extract-district-centroids.mjs`
- **Depends on**: `SPEC-HEALTH-20260829-LANDMARK-SATURATION` (#65) — must be deployed first

---

## 1. Problem Statement

`TAIWAN_DISTRICT_COORDINATES` holds **122 of Taiwan's 368** districts, and the coverage is badly skewed toward the metropolitan north:

```
新北市 21/29   臺中市 15/29   高雄市 14/38   臺南市 10/37
彰化縣  2/26   雲林縣  2/20   屏東縣  3/33   南投縣  2/13
```

An article about 彰化縣二林鎮 or 屏東縣枋寮鄉 cannot reach tier 2 at all. It falls through to the county centroid, which — since `SPEC-HEALTH-20260829-NEWS-LANDMARK-PRECISION` — renders as a 📍 badge with **no map**. So the rural gap costs those articles their map card entirely.

---

## 2. Data Source — validated 2026-08-29

**內政部 / TGOS 鄉(鎮、市、區)界線 1140318**

```
https://www.tgos.tw/tgos/VirtualDir/Product/3fe61d4a-ca23-4f45-8aca-4a536f40f290/鄉(鎮、市、區)界線1140318.zip
```

Contains `TOWN_MOI_1140318.{shp,shx,dbf,prj,CPG}`. Verified properties:

| Property | Value |
|---|---|
| Records | **368** — `.shx` gives `(3044-100)/8 = 368`, `.dbf` header agrees |
| County counts | Match the real administrative division exactly (高雄 38, 臺南 37, 屏東 33, 新北 29, 臺中 29, 彰化 26, 雲林 20, …) |
| Projection | `.prj` = `GEOGCS["GCS_TWD97[2020]"]` — **already degrees**. TWD97 ≈ WGS84 to centimetre level, so **no reprojection** |
| Encoding | `.CPG` = UTF-8; `.dbf` reads directly, no Big5 decoding |
| Fields | `COUNTYNAME`, `TOWNNAME`, `TOWNCODE`, `TOWNENG`, `COUNTYID`, `COUNTYCODE` |
| Geometry | All 368 are shape type 5 (Polygon) |
| Dependencies | **None** — `.dbf` and `.shp` parse with plain `node:fs` |

### Cross-check against the existing 122 hand-written entries

Area centroid of each polygon's largest ring, compared with the current table:

```
matched 122/122, unmatched 0
median deviation 1.57 km
100/122 within 3 km
worst: 花蓮縣秀林鄉 14.7 km, 桃園市復興區 10.5 km, 新北市烏來區 8.6 km
```

**Every large deviation is a mountainous township**, where the hand-picked value is the *better* one: 秀林鄉 is Taiwan's largest township and its population sits on the Taroko coast, while the area centroid lands in the uninhabited Central Mountain Range.

---

## 3. Agreed Architectural Blueprint

### 3.1 Hybrid coordinates — decision recorded

- The **122 existing entries keep their current lat/lng byte-for-byte.** They are better where it matters and preserving them means zero regression risk.
- The **246 new entries use the largest-ring area centroid**, rounded to 4 decimals to match the table's existing precision.

### 3.2 Reproducible extraction (`scripts/extract-district-centroids.mjs`)

Add a script that downloads the zip, parses `.dbf` + `.shp` with `node:fs` only, computes largest-ring area centroids, and prints the merged table. Committing the generator — not just its output — is what makes the next boundary revision a re-run rather than an archaeology exercise. Follow the shape of the existing `scripts/import-*.mjs` files.

### 3.3 Naming convention

The existing table writes **台**, the DBF writes **臺** (`臺北市` / `台北市`). New entries must be normalized to **台** so the whole table is internally consistent — `location_name` is written verbatim from `fullName`, and `classifyLocationPrecision` matches it exactly against this table.

### 3.4 Ambiguity — already handled, do not re-solve

Expanding 122 → 368 raises duplicate district names from 4 names/11 rows to **8 names/19 rows** (adding 中正區, 中山區, 信義區 across 基隆市/臺北市, and 大安區 across 臺北市/臺中市). #65's uniqueness rule already covers this: several districts across several counties yields no landmark rather than the first array entry. **Do not add tie-breaking logic here.**

---

## 4. Explicit Non-Goals

- Do **not** reorder the extraction waterfall. Separate deferred ticket, and it must land after this one.
- Do **not** change `geoExtractor.ts`, `administrativeArea.ts`, `locationPrecision.ts`, or any rendering.
- Do **not** re-extract or backfill existing `news_items` rows.
- Do **not** touch `TAIWAN_COUNTY_CENTROIDS`.

---

## 5. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.
- **Regression guard, mandatory:** assert that all 122 pre-existing entries have byte-identical `county`, `district`, `fullName`, `lat` and `lng` after the change. Report the check, not just the claim.
- Assert the table holds exactly 368 entries and that per-county counts match section 2's table.
- Assert every `fullName` is exactly `county + district` and that no `fullName` repeats.
- Re-run the existing `administrativeArea` tests unchanged — the uniqueness rules must behave identically with the larger table, including the all-districts saturation regression case (which now enumerates 368 names rather than 122).
