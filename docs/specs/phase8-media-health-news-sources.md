# Feature Specification: Media Health News Sources (Phase 8)

## Overview

Adds 5 new `media` (媒體／其他網站) news sources, alongside the existing
udn_health/ltn/top1health/etc. sources in
[`sourceCategories.ts`](../../lib/server/news/sourceCategories.ts):

1. **健康2.0／祝你健康**（SETN, `health.setn.com`）
2. **ETtoday健康雲**（`health.ettoday.net`）
3. **健康醫療網**（`healthnews.com.tw`）
4. **50+（橘世代）健康分類**（`fiftyplus.com.tw/category/health`）
5. **Yahoo奇摩新聞 健康**（`tw.news.yahoo.com/rss/health`）

`health.udn.com/health/index` was also considered but is **out of scope** —
the existing `udn_health` source
([`fetchUdnHealthNews.ts`](../../lib/server/rss/fetchUdnHealthNews.ts))
already scrapes `/health/rank/newest/1005`, which covers the same content
more completely than the homepage would.

Decisions confirmed with account owner before writing this spec:

- All 4 non-RSS sources (SETN/ETtoday/healthnews.com.tw/fiftyplus) use
  **structured HTML list-page scraping**, same tier of effort as
  `fetchUdnHealthNews.ts` — not the cheaper Google News site-search RSS
  fallback used for commonhealth/ttvc/healthforall.
- All 5 new sources (Yahoo included): **summary + thumbnail only, never
  store full article body** — same copyright stance as
  `udn_health`/`ltn`/`top1health` (commercial media, `skipDetailFetch`
  equivalent), regardless of whether the source self-publishes or — in
  Yahoo's case — is itself syndicating other outlets' content.
- `fiftyplus.com.tw`: only `/category/health` and its subcategories, not the
  whole 50+ lifestyle site (finance/travel/spiritual/etc. excluded).
- **Yahoo健康 is an aggregator** that frequently reprints SETN/ETtoday/etc.
  articles under its own URLs. This will produce real content overlap with
  the other 4 sources that the existing dedup (`payload_hash`/`external_id`,
  scoped per `source_name`) cannot catch across domains. Accepted as a
  known tradeoff, same tolerance the codebase already extends to `gnews`
  (Google News search also aggregates many publishers).
- All 5 ship together in one phase, not split further.
- `runIngestion.ts`'s copy-pasted "special source" blocks (Mirror Media /
  UDN / MOENV) get refactored into a shared helper as part of this phase —
  going from 3 to 7 near-identical ~60-line blocks was the trigger to stop
  copy-pasting.

Independent of Phases 1-7 — no shared files besides `runIngestion.ts`
(touched by the refactor in section 2), safe to land any time.

## 1. Data sources & fetch strategy

### 1a. Yahoo奇摩新聞 健康 — real RSS (standard pipeline)

- Feed URL: `https://tw.news.yahoo.com/rss/health`
- Confirmed a genuine RSS 2.0 feed (`<channel><item>` with
  `title`/`description`/`pubDate`/`link`/`guid`, `ttl=5`). Fits
  [`RSS_FEEDS`](../../lib/server/config/rss-feeds.ts) directly — **no
  bespoke fetcher needed**, unlike the other 4 sources below.
- Add to `rss-feeds.ts`:
  ```ts
  {
    code: "yahoo_health",
    name: "健康",
    url: "https://tw.news.yahoo.com/rss/health",
    sourceName: "yahoo_health",
    // Aggregator/syndicated content (often reprints SETN/ETtoday/etc. under
    // Yahoo's own URL) — never store full body even though this is real
    // RSS, not an HTML-scrape special source. See Overview re: accepted
    // content overlap with the site-specific sources above.
    skipDetailFetch: true,
  },
  ```
- `<content:encoded>` unusually contains a bare image URL string (not
  wrapped in `<img>` or `<media:content>`) — rather than special-casing that
  format in `parseRss.ts`/`normalizeItem.ts`, just let the existing
  `fetchOpenGraphImageAsset` fallback in `runIngestion.ts`'s `enrichItem`
  handle the thumbnail (it already activates automatically whenever
  `assets` comes back empty, and `skipDetailFetch` still permits that
  og:image-only pull — see the comment on `enrichItem` in
  `runIngestion.ts`).
- No recency/date-cutoff filter needed (unlike MOENV) — the feed itself
  only ever lists recent items.

### 1b–1e. SETN / ETtoday / healthnews.com.tw / fiftyplus — HTML scrape (special source, like `fetchUdnHealthNews.ts`)

No RSS feed exists for any of these four (verified: `/rss`, `/rss.xml`,
`/RssFeed.aspx`, `/feed` all 404 or redirect to unrelated content — dead
end confirmed by curl before writing this spec). Each gets its own fetcher
module under `lib/server/rss/`, following `fetchUdnHealthNews.ts`'s shape:

fetch listing HTML → cheerio-parse a repeating card selector → normalize
into `EnrichedRssItem[]` → dedupe by a stable per-site `externalId` → no
full-body fetch (`detailHtml`/`detailText` stay `null`, matching the
`udn_health` precedent) → download the listing thumbnail locally via
`downloadArticleImage` (avoid hotlinking a third-party image host, same as
UDN).

Selectors below were captured 2026-08-16 against live pages — worth a
quick re-check at implementation time in case of layout A/B tests, but
these are real, verified DOM structures, not guesses.

**健康2.0／祝你健康（SETN）** — `fetchSetnHealthNews.ts`
- List URL: `https://health.setn.com/`
- Selector: `div.conArea div.conBox.ShadowBox > a[href^="/news/"]` — this
  is the reverse-chronological "最新" list further down the homepage, not
  the `div.newsCarousel` hero block near the top (that one is curated/not
  time-ordered and has no timestamp).
  - `externalId` / `canonicalUrl`: numeric id from `href="/news/{id}"`,
    resolved against `https://health.setn.com`
  - `title`: `h3` text inside `.newsItemsContent`
  - `publishedAtUtc`: `span.newsTimer` text, format `YYYY/MM/DD HH:MM`
    (Taipei local) → `parseTaipeiDateToUtc`
  - `image`: `img[data-original]` (fallback `src`) inside
    `.image-container`
  - `sourceName: "setn"`, `feedCode: "setn_health"`
  - `feedName`: confirm exact display name against the page's own branding
    before finalizing — the `<title>` tag reads "祝你健康", but SETN has
    co-branded this section as "健康2.0" in the past; pick whichever the
    live page's own header/logo shows at implementation time.

**ETtoday健康雲** — `fetchEttodayHealthNews.ts`
- List URL: `https://health.ettoday.net/`
- Selector: `div.piece[newskindf] > p > a[href^="https://health.ettoday.net/news/"]`
  (the "熱門新聞" trending list)
  - `externalId`: numeric id from the URL path `/news/{id}`
  - `title`: anchor text / `title` attribute
  - `publishedAtUtc`: sibling `span.date`, **relative time only**
    (`"N小時前"` / `"N分鐘前"`) — no absolute timestamp on the listing
    page. Parse relative to fetch time (`Date.now() - N * 3600_000` /
    `60_000`). Document this as approximate (±partial-hour precision) —
    same rounding risk any relative-time source carries.
  - `categoryRaw`: sibling `em.tag` text
  - `image`: sibling gallery `img[src]` where present; otherwise falls back
    to `fetchOpenGraphImageAsset` in `enrichItem`
  - `sourceName: "ettoday"`, `feedCode: "ettoday_health"`, `feedName: "ETtoday健康雲"`

**健康醫療網（healthnews.com.tw）** — `fetchHealthnewsNews.ts`
- List URL: `https://www.healthnews.com.tw/`
- Selector: the **first** "編輯精選"-style block — `a[href^="/article/"] > img + div.a1`
  (full, untruncated titles). **Avoid** the visually similar
  `.a1-title`/`span.a1-title` sidebar-widget markup further down the same
  page — those repeat the same articles but truncate titles with `…`.
  - `externalId`: numeric id from `/article/{id}`
  - `title`: `div.a1` text
  - `image`: `img[src]` (already an absolute `healthnews.com.tw` URL)
  - `publishedAtUtc`: **not exposed anywhere on the homepage** for this
    block — no per-article date/time without an actual detail-page fetch,
    which the summary-only policy above rules out. **Open item for
    implementation**: check whether a dedicated archive/list page (e.g.
    `/channel/...` or a paginated `/list`) exposes real timestamps the way
    UDN's `/health/rank/newest/1005` does, before settling for "no
    published date." If nothing better exists, fall back to leaving
    `publishedAtUtc` null and sorting this source by `first_seen_at_utc`
    (ingestion time) instead — flag this as a known UX gap vs. every other
    source (which all have a true publish timestamp).
  - `sourceName: "healthnews"`, `feedCode: "healthnews_tw"`, `feedName: "健康醫療網"`

**50+（橘世代）健康分類** — `fetchFiftyplusHealthNews.ts`
- List URL: `https://www.fiftyplus.com.tw/category/health` — confirm at
  implementation time whether this parent page alone already surfaces
  articles from all 8 health subcategories (sex/menopause/dementia/
  medical/diet/sport/disease/cancer) mixed together, or whether the 8
  subcategory pages need to be crawled individually to get full coverage.
- Selector: `div.card--article`
  - `externalId`: numeric id from `a.pic[href="https://www.fiftyplus.com.tw/articles/{id}"]`
  - `title`: `h3` inside `a.caption`
  - `publishedAtUtc`: `div.info div.date` text, format `YYYY.MM.DD`
    (date only, no time-of-day) — treat as Taipei midnight via
    `parseTaipeiDateToUtc`
  - `image`: `img[data-src]` inside `a.pic` — **lazy-loaded**, `src` is a
    1×1 placeholder GIF; must read `data-src`
  - `sourceName: "fiftyplus"`, `feedCode: "fiftyplus_health"`, `feedName: "50+（橘世代）"`

## 2. `runIngestion.ts` refactor — shared special-source helper

Current state: 3 near-identical ~60-line blocks (Mirror Media, UDN, MOENV)
each doing: call fetcher → log `feedResult` (ok/fail) → `writeIngestionError`
on failure → hash-compare against existing rows → `generateSeoMetadataWithAi`
for new/changed items → push into `enrichedItems`.

Extract a shared helper, e.g.:

```ts
interface SpecialSourceMeta {
  code: string;
  name: string;
  url: string;
  sourceName: string;
}

interface SpecialSourceFetchResult {
  ok: boolean;
  httpStatus: number | null;
  itemCount: number;
  items: EnrichedRssItem[];
  errorMessage: string | null;
}

const processSpecialSource = async (
  meta: SpecialSourceMeta,
  fetchFn: () => Promise<SpecialSourceFetchResult>,
  ctx: { runId: number; feedResults: FeedFetchResult[]; enrichedItems: EnrichedRssItem[] },
): Promise<{ skippedUnchanged: number }> => {
  // body extracted verbatim from the existing mirrorResult/udnResult/moenvResult
  // blocks — behavior-preserving, no logic changes.
};
```

- All 3 existing call sites (Mirror Media/UDN/MOENV) switch to calling this
  helper, plus 4 new call sites for SETN/ETtoday/healthnews/fiftyplus.
- `Yahoo健康` does **not** go through this helper — it's real RSS, so it
  flows through the normal `RSS_FEEDS` loop at the top of `runRssIngestion`
  instead (section 1a).
- **This is a refactor of already-working code, not a behavior change.**
  Verify by running ingestion once before and once after (or diffing a
  dry-run) to confirm identical `feedResults`/insert/update/unchanged
  counts for Mirror Media/UDN/MOENV.

## 3. Type/config changes

- [`types/rss.ts`](../../types/rss.ts) `FeedCode` union: add
  `"yahoo_health" | "setn_health" | "ettoday_health" | "healthnews_tw" | "fiftyplus_health"`.
- [`lib/server/config/rss-feeds.ts`](../../lib/server/config/rss-feeds.ts):
  add the `yahoo_health` entry (section 1a) to `RSS_FEEDS`.
- [`lib/server/news/sourceLabels.ts`](../../lib/server/news/sourceLabels.ts):
  add `setn`, `ettoday`, `healthnews`, `fiftyplus`, `yahoo_health` labels to
  `SOURCE_LABELS`.
- [`lib/server/news/sourceCategories.ts`](../../lib/server/news/sourceCategories.ts):
  add all 5 to the **`media`** category's `sources[]` (not `gov` — all are
  commercial/aggregator sources, keep the indigo badge treatment via the
  existing `isGovSource`/`getSourceBadgeStyle` logic — no changes needed
  there since it already defaults anything not in `gov` to the media
  styling).
- No nav/footer change needed — `/news?group=media` and the nav's news
  dropdown already pick up new `media` sources automatically via
  `SOURCE_CATEGORIES`, same as Phase 6 noted for `gov`.

## 4. Verification & compliance

- `npx tsc --noEmit` / `npm run build` / `npm run lint` — 0 errors.
- Manual: run ingestion once against dev; confirm each of the 5 new
  `source_name` values (`setn`, `ettoday`, `healthnews`, `fiftyplus`,
  `yahoo_health`) lands rows in `news_items`.
- Manual: confirm `detail_html`/`detail_text` are `null` for all 5 sources
  (summary-only policy) — spot-check a few rows directly in the DB.
- Manual: confirm thumbnails are locally-hosted paths
  (`/images/news/articles/...`), never a hotlinked third-party URL, for the
  4 HTML-scrape sources.
- Manual: confirm the `runIngestion.ts` refactor didn't change Mirror
  Media/UDN/MOENV's insert/update/unchanged counts on a real run (section
  2's behavior-preservation check).
- Manual: confirm `/news?group=media` shows all 5 new sources as
  filterable, badges render indigo (not emerald/gov).
- Manual: confirm `healthnews`'s missing `publishedAtUtc` (section 1b, open
  item) was either resolved via a better listing page, or the
  `first_seen_at_utc` fallback was implemented and doesn't break the
  `/news` feed's chronological sort.
- Manual spot-check: pick 2-3 Yahoo健康 items and 2-3 same-day SETN/ETtoday
  items, confirm the accepted duplicate-content behavior (section
  "Overview") looks reasonable in the UI rather than jarring to a reader
  scrolling the feed.
