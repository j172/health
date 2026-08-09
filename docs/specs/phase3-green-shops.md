# Feature Specification: Green Shops Lookup (Phase 3)

## Overview

New top-level 綠色商店 tool (direct nav link, no dropdown — see
[phase1-nav-footer-restructure.md](phase1-nav-footer-restructure.md), which
must be merged first for the `green-shop` `ToolGroup` and catalog stub to
exist). Map+list lookup of 環境部認證綠色商店, same
`FacilitySearchContent` pattern as every other facility tool.

## 1. Data source

`https://data.moenv.gov.tw/api/v2/gp_p_01?api_key=<MOENV_GP_API_KEY>&limit=1000&sort=ImportDate%20desc&format=JSON`

- `api_key` is the account owner's personal key — **do not** hardcode it or
  call this URL client-side. Store as a new server-side env var (e.g.
  `MOENV_GP_API_KEY`), added to `.env.example` (placeholder value only) and
  documented alongside the other env vars in
  [`lib/server/config/env.ts`](../../lib/server/config/env.ts). Never commit
  the real key value.
- Fields per record: `classtype`, `flagno`, `storeno`, `storename`,
  `undertaker`, `storeaddr`, `contacttel`, `taxno`. No coordinates.
- `classtype` looked like a small numeric enum in the sample pulled during
  spec review (`"1"` was the only value seen in a 5-record sample) — **pull
  the full dataset before implementing** and enumerate the actual distinct
  `classtype` values + cross-reference moenv's data-dictionary page for
  `gp_p_01` (linked from the dataset's page on `data.moenv.gov.tw`) to get
  human-readable labels. If `classtype` turns out to be a meaningful
  category (e.g. store type), add it as a `categories` filter in section 4
  below, same pattern as Phase 2's `輪椅可及`/`語音服務` filter. If it's
  not meaningfully differentiable (e.g. always the same value, or an
  internal flag with no clear semantic), skip the category filter for this
  phase.

## 2. Import script

New `scripts/import-moenv-green-shops.mjs`, same shape as the other
`scripts/import-*.mjs` scripts: fetch, dedupe on `storeno` (already a stable
per-store ID from the source, use it directly rather than hashing
name+address), submit via `submitFacilities`:

```js
{
  facilityType: "green_shop",
  sourceKey: "moenv_green_shop",
  sourceId: <storeno>,
  name: <storename>,
  address: normalizeAddress(<storeaddr>),
  phone: <contacttel>,
  lat: null,
  lng: null,
  serviceItem: <classtype label, if section 1 determines one — else null>,
  serviceTime: null,
  dataOrg: "環境部",
}
```

`deletemark`/`flagno` fields (if present, mirroring the `mnews_p_01` pattern
seen in Phase 6) should be checked for a "delisted" flag — moenv's green
shop registry presumably has stores that lose certification; skip importing
rows flagged as delisted/inactive if such a field exists in the full pull.

Register on the same six-monthly (or whatever cadence Phase 2 lands on —
keep these two new facility sources on the same schedule for consistency)
sync job.

## 3. Catalog + config

- `TOOL_CATALOG` entry: slug `green-shops`, `group: "green-shop"`, title
  "綠色商店查詢" (finalize copy; must match whatever slug Phase 1 stubbed).
- `facilitySearchConfigs["green-shops"]`:

```ts
"green-shops": {
  facilityType: "green_shop",
  emoji: "🌱",
  title: "綠色商店查詢",
  description: "查詢環境部認證綠色商店。資料來源：環境部。",
  searchPlaceholder: "輸入商店名稱或縣市關鍵字",
  errorText: "查詢商店資料失敗，請稍後再試。",
  emptyStateNoKeyword: "附近查無收錄的綠色商店，可改用關鍵字搜尋。",
  emptyStateWithKeyword: "查無符合的商店。",
}
```

(add `categories`/`serviceItem: "badge"` only if section 1's `classtype`
investigation finds a meaningful enum.)

- New route `app/tools/green-shops/page.tsx`, same shape as other facility
  pages. If Phase 1 already stubbed a placeholder at this route, replace its
  body with the real `FacilitySearchContent` usage.

## 4. Geocoding

No new work — same existing
[`lib/server/facilities/geocode.ts`](../../lib/server/facilities/geocode.ts)
pipeline as every other source, per the account owner's explicit note ("需要
的話補上座標").

## 5. Verification & compliance

- `npx tsc --noEmit` / `npm run build` / `npm run lint` — 0 errors.
- Manual: confirm `MOENV_GP_API_KEY` is read only in server-side code
  (import script / API route), never bundled into client JS — grep the
  built `.next/static` output for the literal key value as a sanity check
  before calling this done.
- Manual: run the import script against dev, confirm row count is
  reasonable and delisted rows (if that field exists) are excluded.
- Manual: open `/tools/green-shops`, confirm map+list render and nav 綠色商店
  link resolves (no 404).
