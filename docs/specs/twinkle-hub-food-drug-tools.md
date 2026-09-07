# Spec & Ticket: Twinkle Hub 醫療食安工具補完 — 食品營養 & 藥品查詢分頁化

- **Ticket ID**: `SPEC-HEALTH-20260907-TWINKLE-TOOLS-A`
- **Status**: TODO
- **Priority**: HIGH (P1)
- **Affects**: `app/tools/food-nutrition/`, `lib/server/food/`, `lib/server/tools/catalog.ts`, `lib/server/db/schema.ts`, `scripts/`
- **Source of requirements**: https://hub.twinkleai.tw/zh-TW/tools?family=health (9 tools), interview confirmed 2026-09-07 (see §6)
- **Companion tickets**: `SPEC-HEALTH-20260907-NCDR-DISASTER-ALERTS-B` (research-only in this round),
  `SPEC-HEALTH-20260907-DRUG-LABEL-SOURCE-C` (deferred — no official structured TFDA drug-label
  dataset was found live; see §2.1 and the new ticket file)

---

## 1. Problem Statement

Twinkle Hub's `醫療食安` family exposes 9 MCP tools. This site already covers 2 of them
(`query_food_nutrition` → `/tools/food-nutrition`, `search_drug` → `/tools/drugs` partial).
The remaining 7 need to land as new tabs on those two existing pages — not new routes — and
per this repo's standing rule ("所有資料都要進資料庫"), every new dataset gets its own table via
`ensureSchema()` and an import script, matching the `tfda_food_nutrition` / `drugs` /
`tfda_drug_ingredients` precedent. No live pass-through calls to hub.twinkleai.tw or any
upstream API from request handlers.

## 2. Tool → Page → Tab Mapping (confirmed)

| Twinkle tool | Page (existing slug) | New tab | Data source |
|---|---|---|---|
| `analyze_meal_nutrition` | `/tools/food-nutrition` | 餐點總營養分析 | **no new table** — aggregates existing `tfda_food_nutrition` |
| `search_foods_by_nutrient` | `/tools/food-nutrition` | 依營養素排行食物 | **no new table** — ranks existing `tfda_food_nutrition` |
| `search_health_supplements` | `/tools/food-nutrition` | 健康食品(健字號)搜尋 | new table `tfda_health_supplements` — **CONFIRMED LIVE**: `https://data.fda.gov.tw/data/opendata/export/19/json` (also `/csv`, `/xml`), no auth, updated quarterly. See §3.2 for the real field names (verified against a live sample, not guessed). |
| `search_drug` | `/tools/drugs` | (existing — TFDA 許可證搜尋, no change) | `drugs` table (already implemented) |

`lookup_icd10` is out of scope (not requested).

### 2.1 Dropped from this ticket: `get_drug_details`, `search_drug_label`, `check_drug_interaction`

A live source survey (2026-09-07) found **no official structured TFDA dataset** for drug package
insert (仿單) fields — indications/contraindications/side-effects/interactions/dosage/warnings.
data.fda.gov.tw's open-data exports cover only license+appearance (`drugs` table, export 42) and
ingredients (`tfda_drug_ingredients`, export 43); the actual label text exists only as per-drug
PDFs on consumer.fda.gov.tw with no bulk API. Per interview decision, these 3 tools are **out of
scope for this ticket** rather than built on a PDF scraper. They move to
`SPEC-HEALTH-20260907-DRUG-LABEL-SOURCE-C`, which stays TODO/blocked until a real structured
source is found (official TFDA feed, licensed data provider, or an accepted PDF-extraction
pipeline design reviewed on its own merits — not smuggled into this ticket).

## 3. Data Layer

### 3.1 Meal analysis & nutrient ranking (no schema change)

Add to `lib/server/food/nutrition.ts`:

- `analyzeMealNutrition(items: { sampleId: string; grams: number }[])`: for each item, `SELECT` all
  `tfda_food_nutrition` rows for `sample_id`, scale `value_per_100g` by `grams / 100`, sum per
  `nutrient_item` across all items. Return per-food breakdown + totals. Values in the table are
  `VARCHAR` (source data has non-numeric placeholders like `Tr`/`-`); parse defensively with a
  shared `parseNutrientValue()` helper that returns `null` for non-numeric strings rather than
  throwing or coercing to `0`.
- `rankFoodsByNutrient(nutrientItem: string, options: { limit?: number; category?: string })`:
  `SELECT sample_id, sample_name, value_per_100g FROM tfda_food_nutrition WHERE nutrient_item = ?
  ORDER BY CAST(value_per_100g AS DECIMAL(10,2)) DESC` guarded by the same defensive numeric
  parse (exclude non-numeric rows rather than letting `CAST` silently coerce to 0, which would
  incorrectly rank "no data" as lowest instead of excluded).

New route: `app/api/food-nutrition/route.ts` — add `mode=meal` (POST, body `{items}`) and
`mode=rank` (GET, `?nutrient=&limit=`) branches, or split into `app/api/food-nutrition/meal/route.ts`
and `app/api/food-nutrition/rank/route.ts` if the existing route gets unwieldy — follow whichever
existing convention `app/api/facilities/` uses for multi-mode routes.

### 3.2 New table (add to `lib/server/db/schema.ts`, alongside `tfdaFoodOperators`/`drugs`)

```sql
CREATE TABLE IF NOT EXISTS tfda_health_supplements (
  id BIGINT NOT NULL AUTO_INCREMENT,
  license_no VARCHAR(50) NOT NULL,
  category VARCHAR(100) NULL,
  name_zh VARCHAR(255) NOT NULL,
  approved_at DATE NULL,
  applicant VARCHAR(255) NULL,
  status VARCHAR(50) NULL,
  function_ingredients TEXT NULL,
  function_text TEXT NULL,
  claim TEXT NULL,
  warning TEXT NULL,
  notice TEXT NULL,
  source_url VARCHAR(500) NULL,
  synced_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_health_supplement_license (license_no),
  KEY idx_health_supplement_name (name_zh(100))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Field mapping confirmed live 2026-09-07 against `https://data.fda.gov.tw/data/opendata/export/19/json`:
許可證字號→license_no, 類別→category, 中文品名→name_zh, 核可日期→approved_at, 申請商→applicant,
證況→status, 保健功效相關成分→function_ingredients, 保健功效→function_text, 保健功效宣稱→claim,
警語→warning, 注意事項→notice, 網址→source_url. Filter `active_only` in the query layer (per
the Twinkle tool's own default) rather than at import time — keep 失效/註銷 rows in the table so
history isn't silently dropped, same rationale as `drugs`/`tfda_food_operators` keeping inactive rows.

### 3.3 Import script

- `scripts/import-tfda-health-supplements.mjs` — small (~400-600 rows), fetch
  `https://data.fda.gov.tw/data/opendata/export/19/json` directly and POST in one batch to the
  new admin route; no GitHub Actions batching needed (too small to hit the host's `ulimit -v`
  limit that forces `import-tfda-food-nutrition.mjs` off-host), matching the size/pattern of
  `import-nfcc-accessible-atm.mjs`.
- New admin route: `app/api/admin/health-supplements-import/route.ts` — mirror
  `food-nutrition-import/route.ts` (`requireAdminSecret`, `records` array body, delegate to a new
  `upsertHealthSupplements()` in `lib/server/food/healthSupplements.ts` or similar).
- Register in `health-app.crontab` next to the existing TFDA sync jobs, quarterly cadence (matches
  the source's stated update frequency).

## 4. UI

`app/tools/food-nutrition/` already uses `ToolPageShell`. Add a lightweight tab bar (client
component, `useState` for active tab, no new route/URL param needed — matches the "shared slug,
tabs" decision) to `FoodNutritionContent.tsx`: tabs `成分查詢 | 餐點分析 | 營養素排行 | 健康食品`.

Each new tab is its own child component (`MealAnalysisTab.tsx`, `NutrientRankingTab.tsx`,
`HealthSupplementsTab.tsx`) under the same folder, following the existing file-per-concern style
already visible in `components/Tools/`. `/tools/drugs` is untouched by this ticket (see §2.1).

### 4.1 Meal analysis tab

Multi-row form: search-and-add food (reuses existing `searchFoodSamples` autocomplete) + grams
input per row, "加入" to add more rows, "分析" submits all `{sampleId, grams}` pairs to the new
`mode=meal` endpint, renders a totals table (熱量/蛋白質/脂肪/碳水化合物/鈉... one row per
nutrient) plus a collapsible per-food breakdown.

### 4.2 Nutrient ranking tab

Dropdown of common `nutrient_item` values actually present in the table (populate from a
`SELECT DISTINCT nutrient_item FROM tfda_food_nutrition` at build/request time, not a hardcoded
list, since the exact Chinese labels — 鈉/蛋白質/鈣 etc. — must match what's actually stored),
limit selector, results table sorted descending.

### 4.3 Health supplements tab

Search by `name` and/or `function_keyword` (substring match on `name_zh` /
`function_ingredients` / `function_text`), `active_only` checkbox default-on (filters to
`status = '核可'` at query time), result cards show license_no/category/approved_at/applicant/
function/claim/warning/notice. Add the same class of disclaimer already used elsewhere on this
site: 健康食品(健字號) is a TFDA-certified special legal category, distinct from ordinary dietary
supplements, and this tool is public-data lookup only, not a purchase or medical recommendation.

## 5. Decisions Confirmed by Interview (2026-09-07)

1. The 4 drug-family tools (交互作用篩查/藥品詳情/TFDA許可證/仿單查詢) were to live under
   `/tools/drugs`, not `/tools/food-nutrition` (user's literal original message had them
   mis-grouped) — moot for 3 of them now that §2.1 dropped them from this ticket.
2. New tools are tabs inside the existing pages/slugs — no new routes, no `?tab=` URL state
   required (client state is fine).
3. `search_health_supplements` is a `/tools/food-nutrition` tab (per explicit request).
4. Given no live structured drug-label source (§2.1), user chose to ship only the 3 tools with a
   confirmed data source in this ticket (option B), deferring drug-label-dependent tools to
   `SPEC-HEALTH-20260907-DRUG-LABEL-SOURCE-C`.
5. This ticket (A) ships first; NCDR full multi-agency disaster-alert integration is split into
   ticket B and is research/design-only in this round (see that spec for why: 4-5 different
   agency APIs, unknown reliability, should not block A).

## 6. Acceptance Criteria

- `npx tsc --noEmit` and `npm run build` both pass.
- `ensureSchema()` creates `tfda_health_supplements` idempotently.
- The import script runs once locally against a dev DB and reports non-zero `inserted`.
- All 3 new food-nutrition tabs render, submit, and show real DB-backed results (not the Twinkle
  Hub UI, not a live pass-through fetch).
- `lib/server/tools/catalog.ts` entry for `food-nutrition` updated (new `relatedSlugs`/FAQ entries
  reflecting the new sub-tools) so `llms.txt`/sitemap/structured data stay in sync per the file's
  own header comment.
- No new tool calls hub.twinkleai.tw at runtime.
