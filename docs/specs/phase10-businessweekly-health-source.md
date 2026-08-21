# Feature Specification: 良醫健康網 (Business Weekly Health) News Source (Phase 10)

## Overview

Adds 1 new `media` (媒體／其他網站) news source:

- **良醫健康網**（`health.businessweekly.com.tw`）— the health-only
  subdomain of 商業周刊 (Business Weekly), a subscription-based financial
  magazine. `sourceName: "healthbw"`.

Decisions confirmed with account owner before writing this spec (interview
conducted via the `grilling` skill):

- Standard `media` aggregator role — no special treatment vs. the existing
  16 sources.
- Paywalled/member-limited articles are **still included** (title/summary/
  thumbnail only, same as every other commercial-media source — the reader
  hits the paywall themselves on click-through, same as any RSS reader).
- No independent crawl schedule — rides the existing ingestion cron like
  every other source.
- Gets its own source-branded image-missing placeholder (automatic, see
  §3 below — no bespoke work needed beyond the label-map entries).
- **Scraping stance**: title/summary/link/thumbnail only, never full body —
  same copyright posture as `fiftyplus`/`udn_health`/`ltn`/`top1health`.
  robots.txt was checked live before writing this spec (see §1) and does
  not disallow the pages crawled here.
- **Off-topic/advertorial filtering**: handled structurally, not by keyword
  matching — see §1's "real card vs. trending-sidebar" note. No dedicated
  advertorial detector was needed or built (see §1 for why the obvious
  candidate — the 紐崔萊健康學堂 brand-partnership microsite — turned out to
  need no special-casing at all).
- No cross-source dedup (matches existing behavior — no source has this
  today).
- Failure handling: reuses the existing `processSpecialSource` →
  `writeIngestionError` path every other special source already gets; no
  new monitoring/alerting was built for this source specifically.
- **Ship gate**: a manual dry-run (confirm scraped rows/images/filtering
  look right) before this is left to run unattended on cron — see §4.

## 1. Data source & fetch strategy — HTML scrape, no RSS

Confirmed live (2026-08-21) before writing this spec:

- **No RSS/Atom feed**: no `<link rel="alternate" type="application/rss+xml">`
  in `<head>`, no feed link in the footer nav. The only subscription
  mechanism is an email newsletter (`businessweekly.com.tw/epaper`).
- **robots.txt** (`https://health.businessweekly.com.tw/robots.txt`):
  ```
  User-agent: *
  Disallow: /api
  Disallow: /fsearch.aspx
  Disallow: /FSearch.aspx
  Disallow: /hello
  Sitemap: https://health.businessweekly.com.tw/sitemap_index.xml
  ```
  The `/channel/NNNN` listing pages crawled here are not disallowed.
- The site is a server-rendered Nuxt app — `curl`ing a `/channel/NNNN` page
  directly returns full listing-card HTML, no headless browser needed
  (same pattern as every other special source in this codebase).

Like `fiftyplus`, this crawls per-category listing pages rather than a
single feed, because there's no unified "all categories" page. Unlike
`fiftyplus`, health.businessweekly.com.tw is *already* a health-only
subdomain (no finance/travel/lifestyle content to exclude by page choice),
so all 9 of its top-nav categories are in scope:

```ts
const CATEGORY_PAGES = [
  { path: "/channel/0001", label: "防癌" },
  { path: "/channel/0002", label: "減肥" },
  { path: "/channel/0003", label: "養生" },
  { path: "/channel/0004", label: "心靈" },
  { path: "/channel/0005", label: "兩性" },
  { path: "/channel/0006", label: "美容" },
  { path: "/channel/0007", label: "飲食" },
  { path: "/channel/0008", label: "新知" },
  { path: "/channel/0009", label: "百大良醫" },
];
```

Confirmed live: each `/channel/NNNN` page returns a fixed 15
`<a href="/article/ARTLxxxxxxxxx">` links, but only the first ~10 are real
chronological listing cards — each has a `<small class="...text-font-sub">`
publish date (`YYYY-MM-DD`) and a thumbnail `<div style="background-image:
url(...), url('/img/articleDefult.png');">`. The remaining links are a
"熱門排行" (trending) sidebar widget reused across all category pages, which
carries **no date and no thumbnail**, and — confirmed live — is not health-
scoped at all (it surfaced an unrelated horoscope article during spec
research). **Requiring a parseable `YYYY-MM-DD` date on the card is
sufficient to exclude the sidebar widget**, so no separate off-topic or
advertorial keyword filter was needed.

This also resolved the advertorial-content question raised during scoping:
the one clearly-branded partnership content found on the site (紐崔萊健康學堂,
a Nutrilite/Amway-sponsored microsite linked from the top nav) lives at a
completely separate path (`/event/2023/nutrilite/...`), never
`/article/ARTLxxxxxxxxx`. Because the scraper only ever follows
`/article/...` links found on `/channel/...` pages, branded microsites are
excluded by construction — no detection logic required.

Selectors (cheerio), per card `<a href="/article/ARTLxxxxxxxxx">`:
- `externalId`: `ARTLxxxxxxxxx` from the href, via `^/article/(ARTL\d+)$`
- `title`: first `h3` inside the anchor
- `publishedAtUtc`: first `small` inside the anchor, `YYYY-MM-DD` →
  `parseTaipeiDateToUtc` at `00:00:00` (same convention as `fiftyplus`)
- thumbnail: first `div[style*="background-image"]` inside the anchor;
  `background-image:url(X), url('/img/articleDefult.png')` → take `X`
  (the site's own broken-image fallback URL is never treated as real art)
- dedup across the 9 category pages: `Set<externalId>` (articles can appear
  in more than one category's page)

Implementation: [`lib/server/rss/fetchBusinessweeklyHealthNews.ts`](../../lib/server/rss/fetchBusinessweeklyHealthNews.ts),
wired into `runIngestion.ts` via the shared `processSpecialSource()` helper
(same as `fiftyplus`/`setn`/`ettoday`/`healthnews`/`udn_health`/`moenv`).

Full article bodies are never fetched/stored — same commercial-media
copyright stance as the other HTML-scrape special sources.

## 2. Config/label wiring

- `types/rss.ts`: `FeedCode` union gains `"businessweekly_health"`.
- `lib/server/config/rss-feeds.ts`: **no change** — this is a special
  source, not an `RSS_FEEDS` entry.
- `lib/server/rss/runIngestion.ts`: import
  `fetchBusinessweeklyHealthNews`, add a `processSpecialSource(...)` call
  (`code: "businessweekly_health"`, `sourceName: "healthbw"`).
- `lib/server/news/sourceLabels.ts`: `healthbw: "良醫健康網"`.
- `lib/server/news/sourceCategories.ts`: `healthbw` added to the `media`
  category's `sources` list.
- `scripts/generate-source-og-images.mjs`: `healthbw: "良醫健康網"` added to
  its hand-duplicated copy of `SOURCE_LABELS` (documented gotcha in that
  script's own header — must be kept in sync by hand).

## 3. Image handling — no bespoke work needed

`CardThumb.tsx`'s source-branded placeholder
(`lib/server/news/sourcePlaceholder.ts`) and the build-time og:image PNG
generator both derive purely from the `SOURCE_LABELS`/`SOURCE_CATEGORIES`
entries added in §2 — adding those two map entries is the entire image
task. No changes to `CardThumb.tsx`, `sourcePlaceholder.ts`,
`backfillOgImages.ts`, or `imageProviders.ts` were needed.

## 4. Verification & compliance

Same three gates as every phase in this repo (no test framework
configured):
```
npx tsc --noEmit   # 0 errors required
npm run build      # next build, 0 errors
npm run lint       # eslint .
```

Plus, per the confirmed ship gate, a manual dry-run before this rides the
unattended cron:
- Run the ingestion path once manually (admin-manual trigger) and confirm:
  - Rows land with `source_name = "healthbw"`
  - Thumbnails are locally hosted (via `downloadArticleImage`), not
    hotlinked to `ihealth.bwnet.com.tw`
  - `/news?group=media` filter shows 良醫健康網 with the indigo media badge
  - No 熱門排行/off-topic rows leaked through (spot-check a few titles)
  - Missing-image rows render the 良醫健康網-branded placeholder, not the
    generic default
