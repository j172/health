# Feature Specification: Disability-Accessible ATM Lookup (Phase 2)

## Overview

Adds a second tool under the 身心障礙 nav group (created in
[phase1-nav-footer-restructure.md](phase1-nav-footer-restructure.md), which
must be merged first): a merged "信用合作社無障礙ATM查詢" page combining two
NFCC (中華民國信用合作社聯合社) CSV feeds — wheelchair-accessible ATMs and
voice-guided ATMs — into one `FacilitySearchContent` page with a category
filter, rather than two near-duplicate pages (the two source lists are the
same credit-union branches, each flagging a different accessibility
attribute; merging avoids geocoding/storing the same address twice).

## 1. Data sources

- `https://www.nfcc.org.tw/data/commoncharge/atm_wheel_list.csv` — columns:
  `更新日期,序號,代號,信合社,縣市別,區域別,設置地址[...],台數,設置地點聯絡電話與聯絡人`.
  Big5 or UTF-8 — verify encoding when implementing (confirm via response
  headers/byte sniffing, don't assume; MOHW CSVs in this repo are Big5, this
  one hasn't been checked).
- `https://www.nfcc.org.tw/data/commoncharge/atm_voice_list.csv` — columns:
  `更新日期,編號,代號,信合社,縣市別,區域別,設置地址[...],無障礙語音ATM台數`.
- Neither includes coordinates. Match rows across the two files by `代號`
  (credit union branch code) — it's the only shared stable key (序號/編號
  numbering differs between the two files and isn't a reliable join key).

## 2. Merge logic

- Key rows by `代號` (branch code). A row present in the wheel list only →
  category `wheelchair`. Present in the voice list only → category `voice`.
  Present in both → category `both` (or emit as one facility row with both
  badges — see section 4, `serviceItem` shape).
- Facility name: use `信合社` + branch name parsed out of `設置地址`'s
  bracketed suffix (e.g. `[松山分社]`) if present, else just `信合社`.
- `source_key`: `nfcc_accessible_atm`. `source_id`: the `代號` branch code
  (stable across both files and across sync runs).

## 3. Import script

New `scripts/import-nfcc-accessible-atm.mjs`, following the shape of
[`scripts/import-mohw-disability-welfare.mjs`](../../scripts/import-mohw-disability-welfare.mjs):
fetch both CSVs, parse (reuse `parseCsv`/`normalizeAddress` from
[`scripts/lib/mohw-csv.mjs`](../../scripts/lib/mohw-csv.mjs) if its CSV
parser is encoding-agnostic enough, else adapt), merge per section 2, submit
via `submitFacilities` to `/api/admin/facilities-import` with:

```js
{
  facilityType: "disability_atm",
  sourceKey: "nfcc_accessible_atm",
  sourceId: <代號>,
  name: <branch name>,
  address: normalizeAddress(<設置地址, stripped of bracketed annotation>),
  phone: <聯絡電話, parsed from the wheel-list "聯絡人與電話" field if present>,
  lat: null,
  lng: null,
  serviceItem: <"輪椅可及" | "語音服務" | "輪椅可及、語音服務">,
  serviceTime: null,
  dataOrg: "中華民國信用合作社聯合社",
}
```

Schedule alongside the other MOHW import scripts (check
[`scripts/health-app.crontab`](../../scripts/health-app.crontab) /
`run-six-monthly-sync.sh` for where recurring facility imports are wired and
follow the same cadence — these registries change rarely, six-monthly is
likely appropriate, confirm against existing convention rather than
inventing a new cadence).

## 4. Category filter UI

In [`app/tools/facilityConfigs.ts`](../../app/tools/facilityConfigs.ts), add:

```ts
"disability-atm": {
  facilityType: "disability_atm",
  emoji: "🏧",
  title: "信用合作社無障礙ATM查詢",
  description: "查詢全台信用合作社提供輪椅可及或語音服務的無障礙ATM。資料來源：中華民國信用合作社聯合社。",
  searchPlaceholder: "輸入信合社名稱或縣市關鍵字",
  errorText: "查詢ATM資料失敗，請稍後再試。",
  emptyStateNoKeyword: "附近查無收錄的無障礙ATM，可改用關鍵字搜尋。",
  emptyStateWithKeyword: "查無符合的ATM。",
  serviceItem: "badge",
  categories: [
    { value: "輪椅可及", label: "輪椅可及" },
    { value: "語音服務", label: "語音服務" },
  ],
}
```

(`serviceItem: "badge"` matches the existing `clinics`/`pharmacies`/
`home-healthcare` display convention — confirm the category-filter behavior
matches on substring, not exact match, if a row's `service_item` is the
combined `"輪椅可及、語音服務"` string; check
`FacilitySearchContent.tsx`'s category filter implementation and adjust the
match logic if it's currently exact-equality only.)

New route `app/tools/disability-atm/page.tsx`, same shape as
[`app/tools/disability-welfare/page.tsx`](../../app/tools/disability-welfare/page.tsx).

## 5. Catalog entry

Add a `TOOL_CATALOG` entry, slug `disability-atm`, `group: "disability"`,
title "信用合作社無障礙ATM查詢" — this becomes the dropdown's 2nd item
alongside `disability-welfare` (see Phase 1 section 4).

## 6. Geocoding

No new work — rows land with `lat: null, lng: null` and pick up coordinates
through the existing
[`lib/server/facilities/geocode.ts`](../../lib/server/facilities/geocode.ts)
/ `facilities-geocode` admin route pipeline, same as every other facility
source.

## 7. Verification & compliance

- `npx tsc --noEmit` / `npm run build` / `npm run lint` — 0 errors.
- Manual: run the import script against a local/dev `ADMIN_SECRET` target,
  confirm row counts roughly match each CSV's row count (accounting for
  branch-code overlap being merged, not duplicated).
- Manual: confirm a branch present in both source CSVs produces exactly one
  facility row with the combined `service_item`, not two rows.
- Manual: open `/tools/disability-atm`, confirm map+list render, category
  filter narrows results correctly for `輪椅可及` / `語音服務`.
- Manual: confirm nav 身心障礙 dropdown now shows both items.
