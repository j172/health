# Remove 5 permanently-timing-out hpa.gov.tw RSS sources

## Context

While investigating tonight's ingestion-memory work, ran a live timing check (GitHub Actions runner, `curl --max-time 20`) against all 56 configured RSS feed URLs to find the slowest sources. Five of them — all under `hpa.gov.tw` (國民健康署) — timed out completely (no response within 20s):

| code | name | url |
|---|---|---|
| `hpa` | 國民健康署－本署新聞 | `hpa.gov.tw/Pages/ashx/rsspage.ashx?nodeid=124` |
| `hpa_clarify` | 國民健康署－真相說明 | `nodeid=126` |
| `hpa_rumor` | 國民健康署－保健闢謠 | `nodeid=127` |
| `hpa_activity` | 國民健康署－活動熱訊 | `nodeid=128` |
| `hpa_announcement` | 國民健康署－本署公告 | `nodeid=129` |

Every other source responded (fastest 0.06s, slowest non-timeout 4.18s). This isn't a transient blip on one feed — all five `hpa.gov.tw` endpoints are unreachable, every run wastes a full timeout wait per feed for zero data.

## Change

`lib/server/config/rss-feeds.ts`: removed all five `hpa*` entries from `RSS_FEEDS`. Left a comment explaining why, matching the existing convention documented at the top of the file for the 2026-08-31 retirements.

**Not touched** (same convention as the earlier retirements, since `news_items` rows are deliberately not deleted):
- `sourceCategories.ts`'s `{ sourceName: "hpa", label: "國民健康署" }` — historical hpa articles still need their label.
- `types/rss.ts`'s `"hpa"` FeedCode literal — still referenced by stored `news_items.feed_code` values.

## Verification
- `npx tsc --noEmit` — clean.
- `npx eslint lib/server/config/rss-feeds.ts` — clean.
- `npm test` — 375/375 passed.

## Out of scope

Not investigating *why* hpa.gov.tw stopped responding (could be a redesign, an IP block like the nhi.gov.tw precedent, or a permanent takedown of that endpoint) — five consecutive full-timeout results is enough to justify removal regardless of cause, per the existing "noisy/dead source" retirement convention.
