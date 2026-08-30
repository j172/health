# Spec & Ticket: Ingestion Freshness Gate, Future Dates, and Dead Site-Search Feeds

- **Ticket ID**: `SPEC-HEALTH-20260831-FRESHNESS-GATE`
- **Status**: TODO
- **Priority**: HIGH (P1)
- **Affects**: `lib/server/rss/persistItems.ts`, `lib/server/rss/fetchTascTaiwanNews.ts`, `lib/server/config/rss-feeds.ts`, the news read path

---

## 1. Problem Statement

Three reported card defects turned out to share one root: **the pipeline has no notion of how old an item is, and no source is required to supply one.**

### 1.1 A title's event date becomes the publish date

`fetchTascTaiwanNews.ts:119`:

```ts
const publishedAtUtc = parseDateFromTitle(title);
// /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/
```

台灣性諮商學會 publishes course announcements titled 「2026.09.05(六)《當身體遇見社會…》」. The regex takes the **event** date. `/news/876055` is dated 5 days in the future and, because the list sorts newest-first, is pinned to the top of `/news` until that day passes. Measured on the live first page: 40 dated cards, **2 with a negative age**.

`tasctaiwan.weebly.com` carries **no real publish date** — no `<time>`, no date class, no ISO date. The only dates on the page are the ones inside the titles. So "use the real date instead" is not available for this source.

### 1.2 Eight fetchers hardcode a null date

```
fetchIstyleLoveSexNews   fetchMababyNews     fetchMamibuyArticles   fetchSungfulKnowledge
fetchHaruArticles        fetchHelloYishiNews fetchTvbsHealthNews    fetchWeGetCareNews
```

Every article from those eight has no date at all. It is not that the data is unavailable: `istyle.ltn.com.tw/love-sex` shows 29 `YYYY/MM/DD` strings including today's. The `publishedAtUtc: null` is hardcoded.

### 1.3 Eighteen feeds are Google site-search, not news

18 of the 48 feeds in `rss-feeds.ts` use `news.google.com/rss/search?q=site:…`. That is a **site index**, not a news feed. `site:ntuh.gov.tw` returns the hospital's homepage, 網路掛號服務, 雲林分院 掛號服務, 女性基礎套裝, an equipment booking system and a disease glossary entry — with `pubDate` spanning **2007 to 2026**.

Freshness measured across all 18 (100 items each, Google's cap):

```
code                 ≤90d  ≤365d  median age
ubrand_udn             27     45      435d
esg_gvm                20     36      669d
nhi                    18     23      951d
commonhealth           16     22     1298d
ttvc                   16     38      680d
ntuh_news              12     20     1767d
vghtpe_news            11     33     1228d
esg_businesstoday      11     28      761d
ntuh_ifc_news          10     15     1269d
ibt                     9     12      639d
csr_cw                  4     21      863d
twhealth                2      5     2788d
durex_article           2      6     1581d
healthforall            1     10     3104d
worldpeace              1     11     1980d
greenpeace              1      1     2593d
commonhealth_club       1      3     2530d
love_newlife            0      2     2727d
```

The best contributes 27 fresh items per 100; medians run 2–8 years. Note Google `site:` search ranks by relevance, not date, and caps at 100 — so these counts do not prove the sites publish rarely, but they do prove the feed is a poor way to reach whatever they publish.

A title- or length-based quality gate cannot fix this: only 2 of `ntuh_news`'s 100 items have a degenerate title, and the junk items all carry 248–280 character descriptions. They are well-formed pages that simply are not news.

---

## 2. Agreed Architectural Blueprint

### 2.1 Freshness gate at ingestion, 90 days

Reject an item whose age exceeds 90 days, judged on **`COALESCE(publishedAtUtc, firstSeenAtUtc)`**.

**At ingestion, not at read time.** A rejected item must never reach the database, so it also never triggers a detail-page fetch or an image download — load this host cannot afford (see the 2026-08-29 outage).

### 2.2 A title-derived date may never exceed now

`parseDateFromTitle` must return `null` rather than a future date. An event date is not a publish date.

### 2.3 Fall back to first-seen where no real date exists

Display and sort on `COALESCE(published_at_utc, first_seen_at_utc)`.

This is what makes 2.1 work for the eight null-date fetchers without fixing them first: a newly ingested item's `first_seen_at_utc` is now, so it passes; an item already in the table with an old `first_seen_at_utc` reads as old. `persistItems` already writes this column.

### 2.4 Remove seven dead site-search feeds

`love_newlife`, `greenpeace`, `healthforall`, `worldpeace`, `commonhealth_club`, `twhealth`, `durex_article` — each contributes ≤2 items in 90 days. Keeping them means fetching 100 rows per run to discard 98.

The other eleven stay; the gate filters them.

---

## 3. Explicit Non-Goals

- **Do not filter at query time** and **do not delete existing rows.** The live first page is already fresh (40 cards, none older than a day), so the backlog is not surfacing. Known and accepted blind spot: stale rows still appear in site search, the sitemap, and deeper `/news` pages.
- **Do not fix the eight null-date fetchers in this ticket.** Worth doing — `istyle.ltn.com.tw` publishes dates the fetcher ignores — but 2.3 removes it as a prerequisite. Separate improvement, per-source work.
- Do not touch `geoExtractor.ts`, `facilityMatch.ts`, `administrativeArea.ts`, `fetchDetailPage.ts` or any landmark code.
- Do not add npm dependencies.

---

## 4. Verification & Quality Assurance

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass.
- Unit-test the gate: an item 89 days old passes, 91 days is rejected, a **future** date is rejected as a future date rather than passing as "very fresh", a null `publishedAtUtc` falls back to first-seen.
- Unit-test `parseDateFromTitle`: a past date parses, a future date returns `null`.
- Report how many items each remaining feed contributes per run before and after the gate, so the cost of keeping the eleven is visible.
- State what happens to `/news/876055` (the future-dated 台灣性諮商學會 card) after the change — it is the reported symptom and its fate should be explicit.
