# Feature Specification: Health-Checks — MOL Occupational Health Source (Phase 4)

## Overview

Fills a known data gap in the existing 健康檢查機構查詢 tool
([`app/tools/health-checks/page.tsx`](../../app/tools/health-checks/page.tsx),
config in
[`app/tools/facilityConfigs.ts`](../../app/tools/facilityConfigs.ts)) rather
than creating a new "醫療院所" page. The config's description already cites
"職業傷病防治網絡醫院。資料來源：勞動部" and carries a warning that this
source "目前無法連線，暫未收錄" — this phase connects it.

No nav/footer change (this tool already exists under 醫療院所). Independent
of Phases 1-3, 5-7 — can land any time, but sequenced here to avoid
unrelated-file review noise while Phase 1 is in flight.

## 1. Data source

`https://apiservice.mol.gov.tw/OdService/download/A17000000J-030081-puW`

Confirmed dataset: 職業傷病防治網絡醫院 / 職業與環境醫學科 list, 39
institutions. Fields: `序號`, `直轄市或省轄縣市`, `醫療機構名稱`, `市話`,
`分機`, `聯絡人`, `地址`. No coordinates. Verify actual response
format/encoding when implementing (CSV vs JSON, Big5 vs UTF-8 — not
confirmed during spec research, only field names were).

## 2. Import script

New `scripts/import-mol-occupational-health.mjs`, matching the shape of the
other `scripts/import-mohw-*.mjs` scripts:

```js
{
  facilityType: "health_check",
  sourceKey: "mol_occupational_health",
  sourceId: `${醫療機構名稱}|${地址}`.slice(0, 100),
  name: 醫療機構名稱,
  address: normalizeAddress(`${直轄市或省轄縣市}${地址}`.startsWith(直轄市或省轄縣市) ? 地址 : `${直轄市或省轄縣市}${地址}`),
  phone: `${市話}${分機 ? ` 轉 ${分機}` : ""}`,
  lat: null,
  lng: null,
  serviceItem: "職業傷病防治網絡醫院",
  serviceTime: null,
  dataOrg: "勞動部",
}
```

Uses the same `facilityType: "health_check"` as the existing (currently
empty/broken) MOL source this tool was already built for — confirm in
[`lib/server/facilities/queries.ts`](../../lib/server/facilities/queries.ts)
that `source_key` (not `facility_type`) is the uniqueness/dedup boundary, so
this new source can coexist with whatever other `health_check` sources
already populate this facility type without collision.

## 3. Config update

In `app/tools/facilityConfigs.ts`, remove the `noteLine:
"⚠️ 老人免費健檢機構資料源目前無法連線，暫未收錄。"` from the
`health-checks` entry (or reword it if there's a *separate*, still-broken
elder free-checkup source distinct from this MOL occupational-health one —
confirm the two aren't the same thing before deleting the warning; the
warning's wording ("老人免費健檢機構") suggests a different dataset than
this one ("職業傷病防治網絡醫院"), so the warning likely stays, just
no longer describing this newly-connected source).

## 4. Geocoding

Same existing pipeline, `lat: null, lng: null` on import, backfilled by the
existing `facilities-geocode` flow.

## 5. Verification & compliance

- `npx tsc --noEmit` / `npm run build` / `npm run lint` — 0 errors.
- Manual: run the import script against dev, confirm ~39 rows land with
  `facility_type = health_check`, `source_key = mol_occupational_health`.
- Manual: open `/tools/health-checks`, confirm the new institutions appear
  in search results and the note-line change (if any) reads correctly.
- Manual: confirm existing `health_check` rows from other sources (if any)
  are untouched.
