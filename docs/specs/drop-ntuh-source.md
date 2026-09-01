# Decision Record: Drop NTUH and NTUH IFC News Sources

- **Ticket ID**: `SPEC-HEALTH-20260901-DROP-NTUH`
- **Closes**: #108

---

## 1. What happened

The ingestion configuration in `lib/server/config/rss-feeds.ts` included two Google News `site:` search feeds for National Taiwan University Hospital (NTUH):
1. `ntuh_news` (`sourceName: "ntuh"`, 臺大醫院) searching `site:ntuh.gov.tw`
2. `ntuh_ifc_news` (`sourceName: "ntuh_ifc"`, 臺大整合醫療) searching `site:ntuh.gov.tw/ifc`

As documented in `docs/specs/news-freshness-gate.md`, Google News `site:` searches function as site indices rather than timely news feeds. For NTUH, search queries return static hospital landing pages, online registration portals (網路掛號服務), branch registration pages, health check package overviews, and disease glossary entries — with publication timestamps spanning years in the past (median item age > 1700 days for `ntuh_news` and > 1200 days for `ntuh_ifc_news`).

These well-formed static pages are not news articles, and any genuine news published on NTUH's portal is overwhelmed by index noise.

## 2. The decision

**Completely remove `ntuh` and `ntuh_ifc` sources from ingestion, navigation, and purge historical records from the database.**

Unlike sources that were merely retired from active fetching while keeping their historical rows (issue #92), NTUH entries consist overwhelmingly of non-news site index pages. Purging the source ensures:
- No further crawl/fetch resources wasted on stale site index queries.
- Clean database state without obsolete hospital registration/service pages polluting search or category views.
- Consistency with the prior purges of `culture_tw`, `public_art`, and `mababy`.

## 3. Scope of Changes

### A. Ingestion Configuration & Types
- **`lib/server/config/rss-feeds.ts`**: Removed `ntuh_news` and `ntuh_ifc_news` from `RSS_FEEDS`.
- **`types/rss.ts`**: Removed `"ntuh_news"` and `"ntuh_ifc_news"` from the `FeedCode` union type.

### B. UI Navigation & Labels
- **`lib/server/news/sourceCategories.ts`**: Removed `ntuh` and `ntuh_ifc` entries from the `gov` category in `SOURCE_CATEGORIES`.
- **`lib/server/news/sourceLabels.ts`**: Removed `ntuh` and `ntuh_ifc` from `SOURCE_LABELS`.
- **`scripts/generate-source-og-images.mjs`**: Removed `ntuh` and `ntuh_ifc` from `SOURCE_LABELS` and `ALL_SOURCE_NAMES`.

### C. Database Cleanup
- **`lib/server/db/mysql.ts`**: Added `'ntuh'` and `'ntuh_ifc'` to the idempotent cleanup query in `ensureSchema()`:
  ```sql
  DELETE FROM news_items
  WHERE source_name IN ('culture_tw', 'public_art', 'mababy', 'ntuh', 'ntuh_ifc')
  ```
  Foreign keys with `ON DELETE CASCADE` (`news_assets`, `news_card_images`) automatically clean up associated asset and card image rows.

### D. Tests
- **`lib/server/rss/freshness.test.mjs`**: Updated tests to remove `ntuh_news` and `ntuh_ifc_news` from the expected active Google `site:` feeds, and added explicit assertions that `ntuh` and `ntuh_ifc` are absent from `SOURCE_CATEGORIES` and `RSS_FEEDS`.

## 4. Verification

- `npm test`: All unit and integration test suites pass.
- `npm run typecheck`: Zero TypeScript compilation errors.
