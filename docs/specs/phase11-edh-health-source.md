# Feature Specification: 早安健康 (Everyday Health Taiwan) News Source (Phase 11)

## Overview

Adds 1 new `media` (媒體／其他網站) news source:

- **早安健康**（`edh.tw`）— Taiwan's largest consumer health-content
  publisher (H2U / 早安健康出版), covering nutrition, chronic-disease
  self-care, TCM columns and home exercise. `sourceName: "edh"`.

The request that started this arrived as a LINE Today URL
(`https://linetoday.edh.tw/?utm_source=linetoday_tab&utm_medium=index`).
That URL is **not** what this phase crawls — see §1.

Decisions confirmed with the account owner before writing this spec
(interview conducted via the `grilling` skill, 2026-08-23):

- Standard `media` aggregator role — no special treatment vs. the existing
  23 sources.
- **Crawl `edh.tw`, not `linetoday.edh.tw`** — the requested subdomain is
  robots-disallowed in full; the main site is not and carries the same
  articles (see §1).
- Two listing pages per run (`?page=1` + `?page=2`), ≈3.5 days of cover.
- Attribution label is always「早安健康」— `deptName` stays `null` even
  though the payload offers a per-article `authorName`.
- **Scraping stance**: title/summary/link/thumbnail only, never full body —
  same copyright posture as `healthbw`/`fiftyplus`/`udn_health`/`ltn`/
  `top1health`. The listing payload does not expose the body at all, so
  this is enforced by the data source as well as by choice.
- **Ad/advertorial filtering**: handled structurally, not by keyword
  matching — see §1's `type === "article"` note.
- No historical backfill: ingestion starts the day this ships, like every
  other source in this repo.
- No recency cutoff filter: the parsed list is already reverse-chronological
  and cannot surface stale articles (see §1).
- No cross-source dedup (matches existing behavior — no source has this
  today).
- Failure handling: reuses the existing `processSpecialSource` →
  `writeIngestionError` path every other special source already gets; no
  new monitoring/alerting for this source specifically.
- **Ship gate**: local dry-run, then a production `admin-manual` run to
  prove host egress — see §4.

## 1. Data source & fetch strategy — Nuxt payload parse, no RSS

All of the following confirmed live on 2026-08-23 before writing this spec.

### 1a. Why not `linetoday.edh.tw`

```
$ curl https://linetoday.edh.tw/robots.txt
User-Agent: *
Disallow: /
```

The requested URL is disallowed for crawlers in full. `edh.tw`'s own
robots.txt is permissive:

```
$ curl https://edh.tw/robots.txt
User-agent: *
Disallow: /tag$
Disallow: /tag/$
Allow: /tag/
Disallow: /api/
Allow: /api/content/
Allow: /api/author/
Allow: /api/video/
Allow: /api/columnist/

Sitemap: https://edh.tw/sitemap.xml
```

`/article-list` is not disallowed. Measured overlap: the LINE Today page
linked 22 distinct `edh.tw/articles/...` URLs, `/article-list` linked 15,
and **all 15 were present in the LINE Today set** — the main site is the
same content, reached through an allowed door. Nothing is lost by
switching, so this phase crawls `edh.tw` only.

### 1b. Why not RSS, and why not Google News

- **No RSS/Atom feed**: `/rss`, `/feed`, `/rss.xml` all 404.
- **Google News `site:edh.tw` is unusable.** This was already recorded in
  `lib/server/config/rss-feeds.ts` ("confirmed clean … unlike edh.tw") and
  re-confirmed for this spec: 7 of the first 20 result titles were
  Simplified-Chinese prostitution/SEO spam, injected through edh.tw's
  indexed on-site search pages. Those titles would render verbatim on
  `/news` cards. Rejected outright.

### 1c. Why not one API call per article

`https://edh.tw/api/content/{routeCode}` returns clean JSON and is
robots-Allowed, but it yields exactly the same fields the listing payload
already carries. Driving it per-article would mean ~20 requests every 30
minutes (>1,000/day) against edh.tw purely to re-learn what one page load
already said — and the DOM link set it would iterate includes stale
recommendation cards (measured: `5Ojy0Nr`, published 2025-12-12) that only
get discarded *after* their request is spent. Kept as the documented
fallback if the payload format ever breaks (§5).

### 1d. What is actually parsed

`edh.tw` is a server-rendered Nuxt 3 app (`x-powered-by: Nuxt`, plain
`Apache/2.4.41 (Ubuntu)`, no CDN or WAF in front). `curl` with this repo's
own `health.j172.tw-rss-ingestor/1.0` User-Agent returns 200 — no headless
browser and no UA spoofing needed.

**The rendered DOM is not usable as the parse target**: it contains zero
`<time>` elements and no publish date anywhere (cards even leak an
unrendered `aria-label="View: {{ article.title }}"` template string), and
its `<img>` sources are `/_ipx/q_80&s_172x90/...` resize-proxy paths rather
than original art. The phase10 trick of "require a parseable date on the
card to exclude non-chronological widgets" therefore cannot be applied to
the DOM here.

Everything needed lives in the Nuxt payload instead:

```
<script type="application/json" id="__NUXT_DATA__">[ …devalue flat array… ]</script>
```

This is Nuxt 3's standard devalue serialization: a flat JSON array where
object values are *integer indices* into that same array. It parses with a
plain `JSON.parse` plus a small recursive index-deref helper (~15 lines) —
no `devalue` dependency required. The article list is the array entry
shaped `{ item: <index> }`, whose target is a 12-element list.

Per-entry filtering: **list entries are not all articles.** Ad slots are
interleaved as `{ id, type: "ads", data: "<div id=\"_popIn_recommend_4\">…" }`.
Requiring `type === "article"` is sufficient and is the entire
advertorial/ad defence — no keyword detector is needed or built. Measured
2026-08-23:

```
page 1: 8 × article + 4 × ads   (2026-08-23 18:00 → 2026-08-22 09:00)
page 2: 12 × article + 0 × ads  (2026-08-21 18:00 → 2026-08-20 08:00)
```

This also settles the recency question: `data.item[]` is the paginated
reverse-chronological list, entirely separate from the page's 推薦文章 and
焦點專題 blocks (which is where the branded microsites live — `Amino L40`,
`假牙保養1+1`, `【超值推薦】40~80歲可投保…` insurance advertorials, and the
8-month-old recommendation cards). Those blocks are never in `data.item[]`,
so no date-cutoff filter is required.

### 1e. Pages crawled

```ts
const LIST_URLS = [
  "https://edh.tw/article-list",
  "https://edh.tw/article-list?page=2",
];
```

Rationale for two pages: 早安健康 publishes ~5–6 articles/day on the hour
(08/09/11/12/16/18), `rss-sync` runs at `5,35 * * * *`
(`lib/server/cron/registerJobs.ts`), and this repo has **no backfill path
for articles missed during an outage** — `existingHashes` dedupes, it does
not re-discover. Page 1 alone covers ~36 h; page 1+2 covers ~3.5 days,
which survives the multi-day outages already on record (see the
`ops_health_502_watchdog` history). Cost is one extra ~270 KB GET per run.

Explicitly **not** crawled: the 149 `/article-list/{code}` category pages
in the sitemap. The latest-articles stream already spans every category;
fanning out to 149 pages every 30 minutes would be self-inflicted abuse.

Always use the apex host. `www.edh.tw` 302s to the malformed
`https://edh.tw:443/`.

Implementation: `lib/server/rss/fetchEdhNews.ts`, wired into
`runIngestion.ts` via the shared `processSpecialSource()` helper (same as
`healthbw`/`fiftyplus`/`setn`/`ettoday`/`healthnews`/`udn_health`/`moenv`).

### 1f. Field mapping

Per `data.item[]` entry with `type === "article"`:

| `NormalizedRssItem` field | Source |
| --- | --- |
| `externalId` | `routeCode` (e.g. `KOac6mo`) |
| `canonicalUrl` | `https://edh.tw/articles/{routeCode}` — **no** `?referral_origin=` / UTM query. A varying query string would defeat the `canonical_url` half of `getExistingPayloadHashes`' two-key dedup |
| `sourceUrl` | the list URL the item came from |
| `title` | `title` |
| `descriptionText` | `summary` — a complete 70–80 char editorial summary. **Not** `pureContent`, which is hard-truncated to exactly 100 chars mid-sentence |
| `descriptionHtml` | same value as `descriptionText` (the `fetchUdnHealthNews.ts` convention) |
| `publishedAtUtc` | `startDate` (`YYYY-MM-DD HH:mm:ss`, Taipei) via `parseTaipeiDateToUtc` — second-accurate, better than phase10's date-only `00:00:00` |
| `categoryRaw` | `categoryNameDisplay` (生活智慧／糖尿病／中醫師專欄…) |
| `deptName` | `null` — see below |
| `displayType` | `null` |
| `detailHtml` / `detailText` | `null` — full bodies are never fetched or stored |
| `assets[0]` | `webSizeImageUrl` (clean `https://media-edh-cdn.h2u.io/image/article/800X418/*.jpg` original) passed through `downloadArticleImage`, re-hosted locally rather than hotlinked — same treatment as `setn`/`udn_health` |
| `payloadHash` | `sha256` over the extracted fields, same shape as the other special sources |

`deptName` stays `null` deliberately. The payload does expose
`authorName` (`早安健康編輯部`, `新聞中心傅鴻儒`, `黃軒醫師`), but
`resolveAuthorLabel` is `dept_name || SOURCE_LABELS[source_name] ||
feed_name` — populating it would print `黃軒醫師` on the card where every
other media source prints its masthead. All 7 existing special sources set
`null`; this one matches, and cards read「早安健康」.

Dedup across the two pages: `Set<externalId>`.

## 2. Config/label wiring

- `types/rss.ts`: `FeedCode` union gains `"edh_health"`.
- `lib/server/config/rss-feeds.ts`: **no change** — this is a special
  source, not an `RSS_FEEDS` entry.
- `lib/server/rss/runIngestion.ts`: import `fetchEdhNews`, add a
  `processSpecialSource(...)` call (`code: "edh_health"`,
  `name: "早安健康"`, `url: "https://edh.tw/article-list"`,
  `sourceName: "edh"`).
- `lib/server/news/sourceLabels.ts`: `edh: "早安健康"`.
- `lib/server/news/sourceCategories.ts`: `edh` added to the `media`
  category's `sources` list.
- `scripts/generate-source-og-images.mjs`: `edh: "早安健康"` added to its
  hand-duplicated copy of `SOURCE_LABELS` (documented gotcha in that
  script's own header — must be kept in sync by hand, or the source ships
  without its branded og:image).

No i18n work: source labels are not in `locales/`; Simplified rendering is
handled at runtime by OpenCC (SPECIFICATION.md 4.3).

## 3. Image handling — no bespoke work needed

`CardThumb.tsx`'s source-branded placeholder
(`lib/server/news/sourcePlaceholder.ts`) and the build-time og:image PNG
generator both derive purely from the `SOURCE_LABELS`/`SOURCE_CATEGORIES`
entries added in §2 — adding those map entries is the entire image task.
No changes to `CardThumb.tsx`, `sourcePlaceholder.ts`, `backfillOgImages.ts`
or `imageProviders.ts`.

## 4. Verification & compliance

Same three gates as every phase in this repo (no test framework
configured):

```
npx tsc --noEmit   # 0 errors required
npm run build      # next build, 0 errors
npm run lint       # eslint .
```

Local dry-run before merge — run the fetcher once and confirm:
- ~20 items returned across the two pages, none with `type !== "article"`
- every item has a non-null `publishedAtUtc`, and the newest is within a
  day of now
- `canonicalUrl` carries no query string
- thumbnails resolve to local paths (`downloadArticleImage` succeeded), not
  `media-edh-cdn.h2u.io` URLs
- spot-check titles: no `Amino L40` / insurance-advertorial / 焦點專題 rows

Production ship gate, after the manual `deploy-ftps.yml` dispatch:
- Trigger `/api/admin/rss-sync` once (`admin-manual`) and confirm rows land
  with `source_name = "edh"`. **This is the only test of whether the
  production host can reach edh.tw at all** — see §5.
- `/news?group=media` lists 早安健康 with the indigo media badge.
- Missing-image rows render the 早安健康-branded placeholder, not
  `_default.png`.
- Deploy inside the `:15–:30` or `:45–:00` window so the PM2 restart does
  not kill a mid-flight ingestion run (`rss-sync` fires at `:05`/`:35`).

## 5. Known risks, accepted

- **Nuxt payload coupling.** Parsing `__NUXT_DATA__` binds this fetcher to
  a framework serialization format rather than a public contract. If
  edh.tw upgrades across a Nuxt major and the shape changes, the fetcher
  returns 0 items and the existing `writeIngestionError` path records it —
  a visible failure, not silent drift. The documented remedy is to switch
  to the `/api/content/{routeCode}` route described in §1c.
- **Production host egress is unverified at spec time.** edh.tw sits behind
  no CDN or WAF and accepted this repo's ingestor UA from a residential
  connection, so a datacentre-IP block of the kind `nhi.gov.tw` applies is
  unlikely — but "unlikely" is not "measured", and it can only be measured
  from the host. The §4 production run is that measurement. If it does turn
  out to be blocked, the precedent is `nhi`'s `tolerateForbidden` handling.
