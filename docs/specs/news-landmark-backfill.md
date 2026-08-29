# Spec & Ticket: Re-apply the Landmark Rules to Existing news_items

- **Ticket ID**: `SPEC-HEALTH-20260829-LANDMARK-BACKFILL`
- **Status**: TODO
- **Priority**: MEDIUM (P2)
- **Affects**: new `lib/server/news/landmarkBackfill.ts`, new `app/api/admin/news-landmark-backfill/route.ts`
- **Depends on**: #65, #78, #71 — all merged

---

## 1. Problem Statement

Three landmark fixes have shipped, and **no existing row will ever pick any of them up.**

`lib/server/rss/persistItems.ts:116` skips geo extraction entirely when nothing about the article changed:

```ts
if (existing && existing.payload_hash === item.payloadHash) {
  await conn.execute("UPDATE news_items SET last_seen_at_utc = ?, updated_at = ? WHERE id = ?", …);
  unchanged += 1;
  continue;          // extraction never runs
}
```

A published article whose content no longer changes is never re-extracted. The other two paths that write `location_name` are also closed for these rows — `runNewsGeocodeBatch` selects `WHERE lat IS NULL`, and `cardImages.ts` re-extracts only when `lat == null`. Every affected row has a **non-null, wrong** `lat`.

Confirmed live after the #65 deploy: `/news/862449` still renders 📍 and its map card, and `台北市中正區` still appears twice on page 1 of `/news`.

## Scale

From the pre-merge measurement on 160 live articles, the new rules changed 11 of 59 landmarked articles — **~19%** of landmarked rows hold a value the deployed code would no longer produce. The exact figure across the whole table is unknown from outside the host (`MYSQL_HOST` is `127.0.0.1`), which is why this spec requires a dry run before any write.

---

## 2. Agreed Architectural Blueprint

### 2.1 Re-extract only — do not re-fetch

The backfill re-runs `extractLocationFromText` over each row's **existing** `title` + `detail_text`/`description_text`. It issues **no outbound HTTP at all**.

Consequence, accepted deliberately: rows whose `detail_text` was scraped before `SPEC-HEALTH-20260829-CHROME-SCOPING` still contain publisher chrome, including CWA's 368-district SVG enumeration. Those rows will not become *correct*, they will become *silent* — a multi-county or saturated text now yields `null` rather than an arbitrary first-array-hit. That is the right direction and is most of the available win; re-fetching thousands of detail pages would put the load back on the host resource that caused the 2026-08-29 outage.

### 2.2 External geocoding MUST stay off

Call `extractLocationFromText(title, content, /* allowExternalGeocode */ false)`.

This is not a preference. Tier 4 shares one daily OpenCage/Nominatim budget and circuit breaker with the facilities geocode batch (`lib/server/facilities/geocodeBudget.ts`). Letting a multi-thousand-row backfill reach it would exhaust the day's quota in one pass and silently stall facility geocoding.

### 2.3 Dry run first, and it is the default

`{ dryRun: true }` is the default. It computes every transition and writes nothing. Report at minimum:

```
scanned, unchanged, changed, cleared
by transition:  county->null, district->null, county->district,
                district->county, facility->*, *->facility, …
```

A live run requires `{ dryRun: false }` explicitly.

### 2.4 Write policy

- New result differs → update `lat`, `lng`, `location_name`, `facility_id` together.
- New result is `null` → set all four to `NULL`. The badge and map card disappear, which is the point: the stored value is one the current rules would refuse to produce.
- Never touch any other column. In particular **do not** increment `geocode_attempts` — this is not a geocoding attempt.

### 2.5 Shape: batched, locked, paced

Follow `lib/server/news/newsGeocodeBatch.ts`, which already solves this: `withAdvisoryLock` so two runs cannot overlap, a `limit` parameter, and a summary object. Admin route mirrors `app/api/admin/news-geocode-batch/route.ts`, including `requireAdminSecret`.

Selection must be resumable and must not rescan settled rows on every call — state how you achieved that (a cursor on `id`, or a marker column) rather than relying on `ORDER BY … LIMIT` alone.

### 2.6 Known interaction, must be reported not hidden

Tier 1 consults the live `facilities` table, which has grown since many rows were ingested. Some rows will newly match a hospital they could not match before. That is an improvement, but it means this is not a pure "apply the new rules" pass. The dry run must break out `*->facility` transitions separately so the operator can see it.

---

## 3. Explicit Non-Goals

- Do **not** re-fetch detail pages or issue any outbound HTTP.
- Do **not** enable external geocoding.
- Do **not** modify `geoExtractor.ts`, `administrativeArea.ts`, `locationPrecision.ts`, `taiwanDistricts.ts`, `fetchDetailPage.ts`, or any rendering component.
- Do **not** add a scheduled workflow for this. It is an operator-triggered one-off; wiring it to cron risks the load pattern that caused the 2026-08-29 outage.
- Do **not** run it against production as part of this ticket. Ship the code and the dry-run capability; the live run is a separate, deliberate decision.

---

## 4. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- Unit-test the transition logic against fixtures covering: unchanged, county→null, district→county, and a row whose text is saturated (all 368 district names) → null.
- Prove by inspection that no code path in the backfill can reach `queryOpenCage`/`queryNominatim`, and say how you established it.
- Report the endpoint's request/response shape so an operator can run the dry run without reading the source.
