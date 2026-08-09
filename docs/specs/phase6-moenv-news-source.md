# Feature Specification: MOENV News Source — 官方機構 (Phase 6)

## Overview

Adds 環境部 (MOENV) as a 6th 官方機構 news source, alongside the existing
mohw/hpa/cdc/tfda/nhi RSS sources in
[`sourceCategories.ts`](../../lib/server/news/sourceCategories.ts). Confirmed
scope with account owner: recent items only (last ~90 days), no historical
backfill of the dataset's full 2001-present archive.

Independent of Phases 1-5/7 — no shared files, safe to land any time.

## 1. Data source

`https://data.moenv.gov.tw/api/v2/mnews_p_01?api_key=<MOENV_NEWS_API_KEY>&limit=1000&sort=ImportDate%20desc&format=JSON`

- `api_key` is the account owner's personal key — same handling as Phase 3's
  `MOENV_GP_API_KEY`: new server-side-only env var `MOENV_NEWS_API_KEY`,
  documented in `.env.example`/`lib/server/config/env.ts`, never
  client-side, never committed with a real value.
- Fields: `newsno`, `newstitle`, `newscontent` (full HTML body),
  `newssource`, `newsdate`, `relativeurl`, `attachurl`, `deletemark`.
- Not RSS — this is a JSON REST endpoint. **Not** a fit for
  [`RSS_FEEDS`](../../lib/server/config/rss-feeds.ts) (which only handles
  feed XML URLs). Follow the existing precedent for non-RSS sources instead:
  [`fetchUdnHealthNews.ts`](../../lib/server/rss/fetchUdnHealthNews.ts) /
  `fetchMirrorMediaExternals.ts` — both fetch from a non-RSS endpoint and
  normalize into the same `EnrichedRssItem[]` shape the rest of the pipeline
  expects, then get called directly from
  [`runIngestion.ts`](../../lib/server/rss/runIngestion.ts) alongside the
  RSS feed loop (see lines ~151 and ~218 of that file for the pattern to
  copy).

## 2. New fetcher module

`lib/server/rss/fetchMoenvNews.ts`, modeled on `fetchUdnHealthNews.ts`:

- `sourceName: "moenv"`, `feedCode: "moenv_mnews"`, `feedName: "環境部"`.
- Fetch the JSON endpoint (limit 1000, sorted by ImportDate desc — this
  endpoint doesn't support server-side date filtering by the article's own
  `newsdate`, so filtering to "recent" happens client-side after fetch, see
  section 3).
- Skip rows with `deletemark !== "0"` (soft-deleted upstream).
- `externalId` = `newsno` (already a stable per-article ID from the source).
- `canonicalUrl`/`sourceUrl`: use `relativeurl` resolved against
  `https://enews.moenv.gov.tw` (or whatever base the relative paths turn out
  to need — verify against a record that actually has a non-`"-"` value)
  when present; when `relativeurl` is `"-"` (common on older records, per
  spec research), fall back to a URL that at least points at the MOENV news
  system's search/detail-by-id page if one exists, or omit external linking
  and treat the item as self-hosted-only (`detailHtml` already has the full
  body — see section below on `skipDetailFetch`).
- `title` = `newstitle`. `descriptionText` = a truncated/stripped-tags
  excerpt of `newscontent` (first ~200 chars of visible text). `detailHtml`
  = `newscontent` **as-is** (already full HTML, unlike UDN which
  deliberately never stores full body for copyright reasons — MOENV is a
  government source publishing its own official content, same category as
  the other `gov` RSS sources which do store full/detail content via
  `fetchDetailPage`).
- `deptName` = `newssource` (e.g. "行政院環境保護署監資處").
- `publishedAtUtc`: parse `newsdate` (format `"YYYY-MM-DD HH:MM:SS"`,
  Taipei local per the other gov sources) via the existing
  `parseTaipeiDateToUtc` helper used by `fetchUdnHealthNews.ts`.
- `payloadHash`: sha256 of the normalized fields, same convention as every
  other fetcher.
- Register this feed's code (`moenv_mnews` / `sourceName: "moenv"`) so
  `FEEDS_BY_CODE` / `skipDetailFetch`-style logic in `runIngestion.ts`
  doesn't attempt a detail-page fetch for it (content is already complete
  from the API — same treatment as `mirrormedia_healthnews`).

## 3. Recency filter

Since the API always returns up to 1000 rows regardless of age, filter
client-side in the fetcher: only keep rows where `newsdate` is within the
last 90 days of the sync run time. (90 days chosen as a reasonable "recent
official announcements" window, consistent with this being a live-news
feature, not an archive — adjust if it produces too few/too many items once
running against real data.)

## 4. Wire into ingestion + source categories

- In `runIngestion.ts`, add a third special-source block (after the
  `udnResult` block) calling `fetchMoenvNews()`, following the exact same
  structure as the `udnResult`/`mirrorResult` blocks (feed summary
  logging, `persistItems` call, error handling).
- In [`sourceCategories.ts`](../../lib/server/news/sourceCategories.ts), add
  `{ sourceName: "moenv", label: "環境部" }` to the `gov` category's
  `sources` array.
- In [`sourceLabels.ts`](../../lib/server/news/sourceLabels.ts), add
  `moenv: "環境部"` to `SOURCE_LABELS`.
- No nav/footer change needed — `/news?group=gov` and the nav's news
  dropdown (if any groups by source category) already pick up new `gov`
  sources automatically via `SOURCE_CATEGORIES`.

## 5. Verification & compliance

- `npx tsc --noEmit` / `npm run build` / `npm run lint` — 0 errors.
- Manual: confirm `MOENV_NEWS_API_KEY` never appears in client bundle output
  (same check as Phase 3).
- Manual: run ingestion once against dev, confirm moenv items land in
  `news_items` with `source_name = 'moenv'`, `deletemark = '1'` rows are
  excluded, and nothing older than ~90 days is imported.
- Manual: confirm `/news?group=gov` shows 環境部 as a filterable source and
  moenv articles render with full body content (not truncated/missing).
- Manual: confirm `isGovSource("moenv")` returns `true` (badge styling
  picks up the emerald "official" treatment, not the indigo "media" one).
