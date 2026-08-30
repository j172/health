# Spec & Ticket: Make Tier-1 Hospital Matching Deterministic

- **Ticket ID**: `SPEC-HEALTH-20260829-TIER1-FACILITY`
- **Status**: TODO
- **Priority**: HIGH (P1)
- **Affects**: `lib/server/news/geoExtractor.ts`
- **Blocks**: the live run of `SPEC-HEALTH-20260829-LANDMARK-BACKFILL` (#72)

---

## 1. Problem Statement

Found by the #72 dry run. `findFacilityInDb`:

```sql
SELECT id, name, lat, lng, address
FROM facilities
WHERE name LIKE ? AND lat IS NOT NULL AND lng IS NOT NULL
ORDER BY (CASE WHEN name = ? THEN 0 ELSE 1 END), id ASC
LIMIT 1
```

**No `facility_type` filter.** `%榮民總醫院%` matches **175 rows** across six types — clinic 18, ltc_contracted 69, home_healthcare 43, long_term_care 24, health_check 20, disability_welfare 1 — and the lowest-id geocoded row is `[health_check] 臺中榮民總醫院灣橋分院` (id 18362), which is what tier 1 returns for every 榮總 mention today.

**The stored values used to be right** because those articles were ingested before the `health_check` source existed. Adding a facility source silently rewrote every hospital landmark on the site; nothing about the articles changed.

`facility_id` also drives `NewsMapCard`'s 「🏥 檢視醫療機構資訊」 link, so readers are sent to a health-screening listing rather than a hospital.

### Measured: what restricting to `clinic` alone would fix

Across the 33 distinct `searchName` values in `COMMON_HOSPITAL_PATTERNS`:

```
15  exactly one clinic match                    safe
 8  several, but one row's name matches exactly safe (the CASE tie-break fires)
 5  several, NO exact-name row                  id ASC decides — arbitrary
 5  ZERO clinic matches                         regex fires, lookup finds nothing, silent
```

The five ambiguous families: `榮民總醫院` (18), `長庚醫療財團法人` (9), `佛教慈濟醫療財團法人` (9), `三軍總醫院` (5), `馬偕紀念醫院` (4).

The five dead ones are all `臺北市立聯合醫院{和平,仁愛,中興,陽明,忠孝}院區`. The facilities table has no 院區 naming at all — it holds `臺北市立聯合醫院` and `臺北市立聯合醫院附設X門診部`. So an article saying 和平醫院 matches the regex, finds nothing, and silently falls through to the county tier.

---

## 2. Agreed Architectural Blueprint

### 2.1 Restrict the lookup to hospitals

Add `facility_type = 'clinic'` to `findFacilityInDb`. This alone resolves 23 of the 28 searchNames that currently match anything.

### 2.2 Replace the five generic searchNames with per-institution ones

The regexes already distinguish the branches — `中榮` and `高榮` are separate alternatives collapsed into one shared `searchName`. Split them so the exact-name tie-break can fire.

**Every new searchName must be verified to exist as an exact-name clinic row before it is used.** Inventing plausible names is precisely how the five dead `聯合醫院X院區` entries came about. Verified exact-name rows that do exist include `臺北榮民總醫院`, `臺中榮民總醫院`, `高雄榮民總醫院`, `屏東榮民總醫院`.

Some families have **no** parent row under the generic name and must use the real one:

| family | reality in the table |
|---|---|
| 三軍總醫院 | no `三軍總醫院` row; the parent is `三軍總醫院附設民眾診療服務處` |
| 長庚 | no `長庚醫療財團法人` row; only branches such as `長庚醫療財團法人林口長庚紀念醫院` |
| 慈濟 | no `佛教慈濟醫療財團法人` row; only branches such as `佛教慈濟醫療財團法人花蓮慈濟醫院` |
| 馬偕 | `台灣基督長老教會馬偕醫療財團法人馬偕紀念醫院` exists (the Taipei one) |

### 2.3 Decline rather than guess

Where a regex alternative genuinely cannot identify one institution — a bare 長庚醫院 with no city — **return no match** and let the waterfall fall through to the district/county tiers. This is the same uniqueness principle `SPEC-HEALTH-20260829-LANDMARK-SATURATION` established for districts: a tier is used only when it identifies one place.

### 2.4 Ordering must never fall back to `id ASC`

Keep exact-name first, then prefer the **shortest** name — a parent institution's name is a prefix of its branches'. Bare insertion order must not decide a landmark.

### 2.5 Repair the five dead entries

Point the `臺北市立聯合醫院X院區` searchNames at `臺北市立聯合醫院`, which exists. Branch-level precision is unavailable in this data; the parent is correct and, unlike today, actually resolves.

---

## 3. Explicit Non-Goals

- Do **not** run the #72 backfill. This ticket unblocks it; the live run stays a separate decision.
- Do **not** change the waterfall order, `administrativeArea.ts`, `locationPrecision.ts`, `taiwanDistricts.ts`, or any rendering.
- Do **not** add or edit facility data.
- Do **not** widen the lookup to other `facility_type`s to "find more matches". A long-term-care contract row is not the hospital an article is about.

---

## 4. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- **Write a read-only verification script** that resolves every `searchName` against the live `/api/facilities?type=clinic` endpoint and reports, per entry: match count, whether an exact-name row exists, and which row the new ordering would select. Run it and paste the output. Every entry must be either unambiguous or deliberately marked as declining.
- **Zero dead searchNames.** Any entry resolving to no clinic row is a defect, not an acceptable outcome.
- Unit-test the ordering rule over fixtures: exact-name wins over a shorter non-exact name; shortest wins among non-exact; ambiguous declines.
- Re-run the #72 dry run against production afterwards and report the new `byTransition` breakdown, so the effect on the 5 previously-arbitrary `*->facility` transitions is visible before anyone considers writing.
