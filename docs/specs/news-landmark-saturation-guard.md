# Spec & Ticket: Landmark Extraction — Strip SVG Metadata & Require an Unambiguous Match

- **Ticket ID**: `SPEC-HEALTH-20260829-LANDMARK-SATURATION`
- **Status**: TODO
- **Priority**: HIGH (P1)
- **Affects**: `lib/server/rss/fetchDetailPage.ts`, `lib/server/news/geoExtractor.ts`
- **Blocks**: the deferred 122 → 368 expansion of `TAIWAN_DISTRICT_COORDINATES`

---

## 1. Problem Statement & Root Cause

### Symptom
`/news/862449`, a 豪雨特報 whose first sentence reads 「今(29)日**臺南市及屏東縣**地區有局部大雨或豪雨」, is badged **📍 台北市中正區**.

### Root cause A — SVG accessibility metadata is ingested as prose

The article's `detail_text` contains **every township name in Taiwan**:

```
… 基隆市中正區 基隆市七堵區 基隆市暖暖區 基隆市仁愛區 …
… 臺北市中正區 臺北市大同區 臺北市萬華區 臺北市文山區 …
中正區</desc><path id=…
```

The CWA bulletin embeds an **inline SVG map** in which every township is a `<path>` with a `<desc>` naming it. `fetchDetailPage.ts:106` builds `detailText` with cheerio's `detailContainer.text()`, which returns every descendant text node — `<desc>` and `<title>` included.

### Root cause B — tier 2 returns the first array hit

`extractLocationFromText` iterates `TAIWAN_DISTRICT_COORDINATES` in array order and returns immediately on a match. Entry `[0]` is `台北市中正區` (`taiwanDistricts.ts:46`). Once all 368 district names are present, entry `[0]` always wins. The failure is **deterministic**: every article carrying an area map receives the same wrong landmark.

### Measured scale

51 landmark badges across 4 pages of `/news`:

```
  7  台北市              5  高雄市         5  屏東縣
  5  台北市中正區  ← this bug
  ...
  1  新北市永和區        1  新竹縣竹北市
  1  臺中榮民總醫院灣橋分院              1  國立臺灣大學醫學院附設醫院
```

**5 of the 7 district-tier badges (71%) are this one false positive**, and it is the second most common landmark value on the site.

### Why the previously-proposed heuristics do not work

Longest-match, adjacency, and decline-when-ambiguous all assume a small candidate set that needs tie-breaking. Here **all 368 names are present**: there is no ambiguity to resolve, and adjacency is satisfied by the SVG's own literal `臺北市中正區` string.

---

## 2. Agreed Architectural Blueprint

### 2.1 Fix the input (`fetchDetailPage.ts`)

Before `detailContainer.text()`, remove non-prose nodes from the container: SVG `<desc>` and `<title>`, plus `<script>` and `<style>` (cheerio's `.text()` returns those too).

Do this on a **clone** of the container, or otherwise scope it so nothing else derived from the same DOM (notably `detailHtml`) is altered — the rendered article must keep its map.

This also cleans up every other consumer of `detail_text`: `geo_summary`, image search terms, reading-time estimates.

### 2.2 Require an unambiguous match (`geoExtractor.ts`)

Replace "return on first hit" in tiers 2 and 3 with "collect all matches, then decide". **There is deliberately no tunable saturation threshold** — the test is whether a tier can identify a single place:

| Distinct matches | Result |
|---|---|
| exactly 1 district | that district (`matchType: "district"`) |
| several districts, **all in one county** | that county (`matchType: "county"`) |
| several districts spanning several counties | fall through to the county tier |
| exactly 1 county | that county (`matchType: "county"`) |
| several counties | **no landmark** — return `null` |

Rationale for the middle row: 「高雄市各區停班停課」 legitimately names many districts but has one unambiguous county, and 📍高雄市 is the right answer for it. Rationale for the last row: a bulletin naming 臺南市, 屏東縣 and 嘉義縣 has no single landmark, and picking one by array position is exactly the defect being fixed.

Tier 1 (facility) and tier 4 (external geocode) are unchanged.

### 2.3 Known and accepted behaviour change

Articles that mention more than one county will lose their landmark badge instead of silently receiving the array's first entry. That is intended: today's value in those cases is arbitrary. The implementer must **report the measured effect** on a sample rather than assert it is small.

---

## 3. Explicit Non-Goals

- Do **not** expand `TAIWAN_DISTRICT_COORDINATES` to 368 entries in this ticket. This work must land first; expanding earlier neither fixes the bug nor leaves the new rules meaningfully testable.
- Do **not** reorder the waterfall (`facility → district → geocode → county`). Separate deferred ticket.
- Do **not** change `classifyLocationPrecision` or any rendering. `SPEC-HEALTH-20260829-NEWS-LANDMARK-PRECISION` already shipped and its four tiers keep their meanings.
- Do **not** re-extract or backfill existing `news_items` rows as part of this ticket. Fix the code path; existing rows correct themselves as articles are re-ingested.

---

## 4. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm run build`, `npm test` all pass.
- Extend `lib/server/news/*.test.mjs` with cases for the decision table above: single district; several districts in one county; several districts across counties; single county; several counties → `null`.
- Add a regression case built from the real failure: text containing every district name plus 臺南市 and 屏東縣 must produce **no landmark**, never `台北市中正區`.
- Confirm the `fetchDetailPage` change removes SVG `<desc>` text from `detailText` **without** altering `detailHtml`, and state how this was confirmed.
- Report the measured before/after landmark rate on a representative sample of article text.
