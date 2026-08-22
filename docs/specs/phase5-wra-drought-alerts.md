# Feature Specification: WRA Drought/Water-Restriction Alerts (Phase 5)

## Overview

Adds 經濟部水利署 (WRA) 枯旱限水通報 as a second alert source feeding the
existing 即時氣象警報 sidebar widget
([`WeatherAlertSidebarWidget.tsx`](../../components/Tools/WeatherAlertSidebarWidget.tsx)).

**Scope note (confirmed with account owner):** only the drought/water-
restriction feed is in scope. The second WRA URl originally proposed
(`301c0b62-...`) turned out to be a KML flood-inundation map layer, not a
text bulletin — that's an unrelated, much larger feature (a map overlay
subsystem) and is explicitly **out of scope** for this phase; file
separately if/when there's a concrete need.

Independent of Phases 1-4/6/7 — no shared files, safe to land any time.

## 1. Data source

`https://opendata.wra.gov.tw/api/v2/51ea7202-18fd-46e3-adae-4d05bc827a28?sort=_importdate%20asc&format=JSON`

Fields: `通報日期`, `預警水情`, `水庫名稱`, `供水區`, `標題`. Historical log
back to 2012, **not** CAP format, no `effective`/`expires` fields. Existing
CWA alert ingestion (`lib/server/cwa/sources/alerts.ts`) parses CAP records
into the `cwa_alerts` table — this doesn't fit that shape and needs its own
parser, writing to a **new** table (don't force-fit into `cwa_alerts`'s
CAP-shaped columns).

## 2. How the widget actually determines "生效中" (read this before designing the sync)

The widget does **not** read `cwa_alerts` directly. It reads
`news_items` via
[`listActiveWeatherWarnings`](../../lib/server/news/queries.ts) (around line
82):

```sql
SELECT id, title, published_at_utc FROM news_items
WHERE source_name = 'cwa'
  AND published_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR)
ORDER BY published_at_utc DESC LIMIT ?
```

CWA's sync job re-upserts a `news_items` row (bumping `published_at_utc` to
"now") on every sync tick for as long as an alert is still present in the
CAP feed; once it drops out of the feed, the row stops being refreshed and
ages out of the 6-hour window on its own. That's the actual "is it still in
effect" mechanism — not a stored `expires` timestamp.

**Apply the same pattern for WRA**, adapted for a much slower-moving feed:

- New sync job (own cadence — daily is plenty; this bulletin doesn't update
  hourly) determines the **latest `通報日期` row per `水庫名稱`**.
- For each reservoir's latest row, upsert a `news_items` row: `source_name =
'wra'`, `title` = the record's `標題`, `published_at_utc` = **now** (the
  sync run time, not `通報日期` — same "keep refreshing while still
  current" mechanism as CWA, not a literal timestamp of the original
  bulletin).
- If a reservoir's latest row hasn't changed since the last sync (same
  `通報日期`+`標題`), still refresh `published_at_utc` to now, exactly like
  CWA repeatedly re-publishing an unlifted warning — this is what keeps it
  inside the freshness window between syncs.
- If a reservoir drops out of the latest-row set (superseded or the
  reservoir no longer appears in recent data), simply stop refreshing its
  row — it ages out naturally once the window passes.

## 3. Widget query change

Extend `listActiveWeatherWarnings` in
[`lib/server/news/queries.ts`](../../lib/server/news/queries.ts) to also
select `source_name = 'wra'`, but with a **longer window** than CWA's 6
hours (a 6-hour window would flap on/off between daily WRA sync runs). Use a
window sized to comfortably survive one missed sync — e.g. 48 hours if the
sync runs daily. Don't hardcode a single shared `ACTIVE_WARNING_WINDOW_HOURS`
for both sources; parameterize per `source_name`:

```sql
WHERE (source_name = 'cwa' AND published_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 6 HOUR))
   OR (source_name = 'wra' AND published_at_utc >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 48 HOUR))
ORDER BY published_at_utc DESC LIMIT ?
```

Confirm `news_items` schema doesn't require fields this synthetic WRA row
can't supply (check `NOT NULL` columns in the `news_items` DDL in
[`lib/server/db/schema.ts`](../../lib/server/db/schema.ts) — `feed_code`,
`external_id`, `canonical_url`, `source_url`, `payload_hash` etc. are
`NOT NULL`; synthesize reasonable values, e.g. `canonical_url`/`source_url`
pointing at the WRA opendata resource URL itself since there's no per-bulletin
article page, `external_id` = 水庫名稱 slug, `payload_hash` = hash of the
row content for idempotent upserts).

## 4. New table (optional, for audit/history — not required by the widget)

If useful for debugging/audit trail, add a `wra_drought_alerts` table
mirroring the shape of `cwa_alerts` but with WRA's actual fields
(`report_date`, `alert_level`, `reservoir_name`, `supply_area`, `title`),
`UNIQUE KEY` on `(reservoir_name, report_date)`. Optional — the widget only
needs the `news_items` upsert from section 2/3; skip this table if it adds
scope without clear benefit.

## 5. Sync job registration

New `runWraDroughtSync` module (mirrors
[`lib/server/cwa/runSync.ts`](../../lib/server/cwa/runSync.ts) shape),
registered in
[`lib/server/cron/registerJobs.ts`](../../lib/server/cron/registerJobs.ts)
on a daily schedule, e.g. `cron.schedule("0 7 * * *", runGuarded("wra-drought-sync-cron.log", () => runWraDroughtSync()))`.

## 6. Verification & compliance

- `npx tsc --noEmit` / `npm run build` / `npm run lint` — 0 errors.
- Manual: run the sync job once against dev, confirm `news_items` rows land
  with `source_name = 'wra'` and required-not-null columns are populated.
- Manual: confirm the widget shows WRA bulletins alongside CWA ones when
  both are current, and that an old/stale reservoir bulletin does **not**
  show (verify by manually back-dating a test row's `published_at_utc`
  past the 48h window).
- Manual: confirm re-running the sync twice in a row doesn't create
  duplicate `news_items` rows for the same reservoir (upsert, not insert).

---

## 7. Implementation note (2026-08-21) — upstream is behind bot protection

Phase 5 is now implemented: `lib/server/wra/client.ts`, `lib/server/wra/runSync.ts`,
the per-source window in `listActiveWeatherWarnings`, the daily 07:00 cron in
`registerJobs.ts`, and a manual trigger at `POST /api/admin/wra-sync`.

**It cannot currently return data.** The source URL in section 1 sits behind an
F5 Shape/BIG-IP JavaScript challenge. A plain server-side request gets
`HTTP 200` with `Content-Type: text/html` and a `bobcmn`/`TSPD` challenge page
rather than JSON — verified directly against the live endpoint.

`fetchWraDroughtRecords()` detects this and throws `WraFeedBlockedError`, so the
daily cron logs an accurate reason instead of an opaque JSON parse failure, and
`runWraDroughtSync()` returns it in `result.error` without touching `news_items`.
Nothing else in the app is affected: the widget query already tolerates zero WRA
rows, and CWA warnings are unchanged.

### Resolved 2026-08-22 — the fetch moved to a GitHub runner

Measured with `.github/workflows/egress-probe.yml`: the same URL returns **200
with real data from a GitHub Actions runner** while the production host gets the
challenge page. The block is on the host's address, not on server-side clients
generally.

So the daily job now lives in `.github/workflows/wra-drought-sync.yml`:
`scripts/gha-wra-drought-sync.mjs` fetches on the runner and POSTs the rows to
`/api/admin/wra-sync`, which re-normalizes and re-filters them before upserting —
the runner is a transport, not a trusted source. The in-app cron entry was
removed, since it could only ever log a daily failure; `runWraDroughtSync()`
still fetches for itself when called with no records, for the day the block lifts.

The original options, kept for the record:

1. an allowlisted source address for the production host with WRA,
2. a credentialed WRA API route, if one exists for this dataset, or
3. a mirror of the dataset that is not challenge-protected (data.gov.tw carries
   copies of many WRA datasets — worth checking for this resource id).

Section 4's optional `wra_drought_alerts` audit table was deliberately not built,
per that section's own guidance: the widget does not need it, and it would add
schema surface for no current benefit.
