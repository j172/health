# Spec & Ticket: News Landmark Precision Tiers & Static Map Hash Collision

- **Ticket ID**: `SPEC-HEALTH-20260829-NEWS-LANDMARK-PRECISION`
- **Status**: TODO
- **Priority**: HIGH (P1)
- **Affects**: `lib/server/news/geoExtractor.ts`, `lib/server/news/staticMap.ts`, `lib/server/news/cardImages.ts`, `components/News/NewsCard.tsx`, `components/News/NewsMapCard.tsx`, `app/news/[id]/page.tsx`

---

## 1. Problem Statement & Root Cause

### Symptom
The 📍 landmark badge on news cards appears inconsistently, and — worse — sometimes points at the wrong place entirely.

### Measured Facts (2026-08-29, live `https://health.j172.tw/news`)

Parsed landmark values, by the waterfall tier that produced them:

```
高雄市 x4  桃園市  新北市  屏東縣  宜蘭縣  南投縣    tier 3 county centroid   9  (82%)
新北市永和區   台北市中正區                          tier 2 district          2  (18%)
                                                    tier 1 hospital          0
                                                    tier 4 street geocode    0
```

A live false positive:

> `/news/862449` — 「08/29 09:40 發布豪雨特報」(中央氣象署)
> Body: 「今(29)日**屏東縣**地區有局部大雨或豪雨，**嘉義以南**地區有局部大雨…」
> Badge: **📍 台北市中正區**, and the article page draws a map pinned in Zhongzheng District at 4-decimal precision.

### Root Causes

1. **Every tier renders identically.** `NewsCard.tsx` and `app/news/[id]/page.tsx` gate the badge on `location_name != null`; `app/news/[id]/page.tsx` gates `NewsMapCard` on `lat != null && lng != null`. Nothing distinguishes 國立臺灣大學醫學院附設醫院's real coordinates from 高雄市's city-hall centroid, so a ±30km guess is drawn with `{lat.toFixed(4)}°N` — a claim of ~11m precision.
2. **`matchType` is computed and thrown away.** `extractLocationFromText` returns `matchType: "facility" | "district" | "county" | "geocoded"`, but `news_items` (see `lib/server/db/mysql.ts`) only stores `lat`, `lng`, `location_name`, `facility_id`.
3. **Static map images collide on their content hash.** `generateStaticMapSvg(lat, lng, locationName)` depends on nothing else — no `newsId`, no timestamp — so two articles both resolved to 高雄市 produce byte-identical SVG, identical `content_sha256`, and the second one hits `UNIQUE KEY uq_card_image_hash` and is dropped by `INSERT IGNORE`. `assignStaticMapImage` then returns `affectedRows === 1` → `false`, the article stays imageless, and because `cardImages.ts` orders candidates by `image_backfill_attempts ASC` it is picked up again next run — after `fs.writeFile` has already written an orphan SVG that no DB row will ever reference.

---

## 2. Agreed Architectural Blueprint

### 2.1 Derive precision — do NOT add a column

Add `classifyLocationPrecision(locationName: string | null, facilityId: number | null): "facility" | "district" | "county" | "geocoded" | null`, exported from `lib/server/news/geoExtractor.ts`.

The four tiers write mutually exclusive values, so classification is exact and works on **every historical row with no migration and no backfill**:

| Tier | `location_name` written | `facility_id` |
|---|---|---|
| 1 facility | `facility.name` | **non-null** |
| 2 district | `item.fullName` (e.g. 台北市中正區) — exactly a `TAIWAN_DISTRICT_COORDINATES.fullName` | null |
| 3 county | `countyItem.name` (e.g. 台北市) — exactly a `TAIWAN_COUNTY_CENTROIDS.name` | null |
| 4 geocoded | the raw street address — the tier-4 regex forces a `路\|街\|大道\|巷\|弄\|號` suffix, so it can never equal a tier-2 or tier-3 value | null |

Classification order: `facility_id != null` → `facility`; exact match in `TAIWAN_COUNTY_CENTROIDS` → `county`; exact match in `TAIWAN_DISTRICT_COORDINATES.fullName` → `district`; otherwise → `geocoded`.

`geocoded` is deliberately the fallback bucket: an unrecognised value is treated as high precision, which preserves today's rendering rather than introducing a new regression.

### 2.2 Rendering rules

| Precision | 📍 badge | Map card | Coordinate line |
|---|---|---|---|
| `facility` | yes | yes | yes |
| `geocoded` | yes | yes | yes |
| `district` | yes | yes | **removed**, heading copy becomes 約略位置 |
| `county` | yes | **no** | n/a |

- `app/news/[id]/page.tsx` renders `NewsMapCard` only when precision is **not** `county`.
- `NewsMapCard.tsx` takes a new prop for approximate mode. In that mode it drops the `{lat.toFixed(4)}°N, {lng.toFixed(4)}°E` line and the 相關地理位置 heading reads 約略位置.
- The 📍 badge is unchanged for all four tiers, in both `NewsCard.tsx` and `app/news/[id]/page.tsx`.

### 2.3 Static map: stop tier 3, and fix the collision

- In `cardImages.ts`, call `assignStaticMapImage` **only when precision is not `county`.** A map pinned at a city hall is the same lie as the article-page map card, relocated to the cover image.
- In `staticMap.ts`, mix `newsId` into the digest: `sha256(svgContent + newsId)`. Do **not** change the schema. `uq_card_image_hash` exists to stop one Unsplash photo being reused across articles; that purpose is preserved for real photos while static maps become per-article unique.

---

## 3. Explicit Non-Goals — deferred to `SPEC-HEALTH-20260829-NEWS-LANDMARK-COVERAGE`

The following are **agreed but out of scope for this ticket**, and are blocked on sourcing 368 district coordinates:

- Reordering the waterfall to `facility → district → geocode → county`. (Tier 3 currently intercepts tier 4 for all 24 real county/city names, verified by cross-checking the tier-4 regex against `TAIWAN_COUNTY_CENTROIDS`; only defunct names 台北縣/桃園縣/… and 縣轄市 forms 屏東市/宜蘭市/… reach tier 4.)
- Expanding `TAIWAN_DISTRICT_COORDINATES` from 123 to all 368 districts. Present coverage is skewed: 新北市 21/29, 台中市 15/29, 高雄市 14/38, 彰化縣 2/26, 雲林縣 2/20, 屏東縣 3/33.
- Scheduling `scripts/gha-news-geo-image-backfill.mjs`, which is currently referenced by no workflow and no `registerJobs.ts` entry.

**Reordering must not ship before the district table is expanded**, or the shared OpenCage/Nominatim budget takes an avoidable spike.

---

## 4. Verification & Quality Assurance

- `npm run typecheck` returns 0 errors.
- `npm run lint` passes.
- `npm run build` succeeds.
- Unit-test `classifyLocationPrecision` against one real value per tier, including `("高雄市", null) === "county"` and `("新北市永和區", null) === "district"`.
- An article whose `location_name` is a bare county name renders the 📍 badge and **no** map card.
- An article whose `location_name` is a district full name renders a map card with no coordinate line.
- **Re-verify the static map write path end to end**: `public/images/news/maps/` is writable, the SVG renders non-blank in a card thumbnail, and two different articles resolved to the same district now both receive a row in `news_card_images`. This path caused a blank-thumbnail incident on 2026-08-21 and must not be assumed healthy.
