# Spec & Ticket: 婦幼安全警示地點 — Honest Geocode Coverage & Source Typo

- **Ticket ID**: `SPEC-HEALTH-20260829-CHILD-SAFETY-HONESTY`
- **Status**: TODO
- **Priority**: MEDIUM (P2)
- **Affects**: `app/tools/facilityConfigs.ts`, `scripts/import-npa-child-safety-spots.mjs`

---

## 1. Problem Statement & Root Cause

### Symptom
`/tools/child-safety-spots` (婦幼安全警示地點查詢) shows almost nothing near the user, and gives no hint why.

```
全台已定位   24 / 186  = 13%
@台北 10km    2 筆      @台中 1 筆      @高雄 0 筆
```

### The data is complete — this is not a missing-rows problem

The NPA source CSV (`opdadm.moi.gov.tw`, dataset `DBB18796-…`) is UTF-8 with BOM and holds **186 data rows**; production holds 186. The import is correct and loses nothing.

### Root cause: the `Address` column is not an address

It is a description of an alert *road segment or location*, not a street address:

```
186 rows —
  含門牌號碼 (N號)                        7   (4%)
  含 路/街/道                            127
  含 縣/市 前綴                          123
  純地標名（無路名、無縣市）                36   e.g. 捷運中山站、二二八和平公園、磺港公園
  模糊描述（路口/周邊/附近/區塊/沿線）        64   e.g. 松廉路段(松仁路至松智路區塊內之廊道及空橋)
```

`child_safety_spot` is already enrolled in the geocode backfill (`lib/server/facilities/geocodeBatch.ts:48`, `scripts/geocode-all-facilities.mjs:25`), so this is not a scheduling gap. OpenCage and Nominatim simply cannot resolve 「指南路一段道南橋下涵洞附近」 to a point, and **they should not** — many of these rows describe an interval, which has no single coordinate.

### Secondary: the config hides the gap

`facilityConfigs.ts` does not set `showGeocodeNote` for this tool, unlike `pharmacies` (line 43) and `home-healthcare` (line 126). So the 87% of rows with no coordinates vanish from the nearby search without the UI ever saying so.

### Tertiary: one mojibake row, upstream

Line 162 of the government CSV reads `?裡海水浴場` (澎湖縣政府警察局 / 馬公分局). The correct name is **嵵裡海水浴場** — `嵵` is a rare CJK character the publisher's own pipeline appears to have lost. Our import is not at fault; `res.text()` decodes the UTF-8 source correctly.

---

## 2. Agreed Architectural Blueprint

### 2.1 Surface the coverage gap (`facilityConfigs.ts`)

- Set `showGeocodeNote: true` on `child-safety-spots`, so each un-geocoded row renders the existing 「（尚未完成地理定位，暫不顯示於地圖）」 note.
- Extend the `description` with the data's actual nature and coverage, e.g.:

  > 本表為警政署公告之警示路段與地點描述，多數非門牌地址（如捷運站、公園、路口周邊），約 87% 尚未完成地理定位，未定位者不會出現在附近搜尋結果中。

### 2.2 Correct the upstream typo — **without changing `sourceId`**

`scripts/import-npa-child-safety-spots.mjs` builds `sourceId: npa_${rawNo}_${address}`, and `upsertFacilities` keys on `UNIQUE KEY uq_facility_source (source_key, source_id)`.

**`sourceId` must keep deriving from the uncorrected raw address.** It is an identity key, not display data. If the correction flows into it, the next import INSERTs a second row and leaves the `?裡海水浴場` row orphaned — 187 rows, one of them stale, with nothing to clean it up.

Apply the correction only to the `name` and `address` fields. `ON DUPLICATE KEY UPDATE` already refreshes both (`lib/server/facilities/queries.ts`), so a re-import updates the existing row in place.

Implement as a small, documented correction map keyed on the exact raw string, not a general-purpose transform — this is one known upstream defect, not a class of them.

---

## 3. Explicit Non-Goals

- **Do NOT try to raise the geocoding rate** by stripping 「路口 / 周邊 / 附近 / 區塊 / 沿線」 suffixes and geocoding the remaining road name. A 7-decimal coordinate for 「松仁路至松智路區塊」 is exactly the false precision that `SPEC-HEALTH-20260829-NEWS-LANDMARK-PRECISION` was written to remove. The correct presentation for this dataset is the list plus its 管轄單位與窗口 contact (the config already sets `serviceItem: { label: "管轄單位與窗口：" }`), not a map pin.
- Do NOT change the geocode batch enrolment.
- Do NOT alter the import's row filtering — 186/186 is correct.
- Do NOT touch the shared `FacilitySearchContent` component; the nearby-fallback shipped in #62 already covers the 0-result case here.

---

## 4. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm run build` all pass.
- `/tools/child-safety-spots` renders 「（尚未完成地理定位，暫不顯示於地圖）」 on un-geocoded rows, and the description states the coverage caveat.
- Confirm by inspection that the corrected row's `sourceId` is byte-identical to the one currently stored, so a re-import updates rather than duplicates. State how this was confirmed.
- Do **not** run the importer against production as part of this ticket.
