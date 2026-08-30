# Feature Specification: Expanded Media and Health News Sources (Phase 12)

## Overview

Adds 15 health, medical center, public health, and wellness sources to the platform, expanding coverage across official public health communications, medical center announcements, pregnancy/parenting, sexual wellness, and evidence-based preventive health:

### 1. Official & Medical Center Sources (`gov` category)
1. **疾病管制署－疫情訊息** (`cdc_outbreak`, RSS: `https://www.cdc.gov.tw/RSS/RssXml/khD5i5xbqmYc8zCDhJimNg?type=1`)
2. **疾病管制署－致醫界通函** (`cdc_letters`, RSS: `https://www.cdc.gov.tw/RSS/RssXml/VYgwM0EtOqAhCmd0iJrhfg?type=4`)
3. **疾病管制署－新聞稿** (`cdc`, RSS: `https://www.cdc.gov.tw/RSS/RssXml/Hh094B49-DRwe2RR4eFfrQ?type=1` — existing, verified)
4. **臺大醫院總院－最新消息** (`ntuh`, `https://www.ntuh.gov.tw/ntuh/News.action#top`)
5. **臺大醫院整合醫療健康中心** (`ntuh_ifc`, `https://www.ntuh.gov.tw/ifc/News.action?agroup=a#top`)
6. **亞東紀念醫院－研究與最新消息** (`femh`, `https://www.femh.org.tw/research/news?class=1`)

### 2. Media & Wellness Sources (`media` category)
7. **Women's Health Taiwan 美力圈** (`womenshealth`, RSS: `https://www.womenshealthmag.com/tw/rss/default.xml`)
8. **華人健康網** (`top1health`, RSS: `https://www.top1health.com/Rss` — existing, verified)
9. **Hello 醫師** (`helloyishi`, `https://helloyishi.com.tw/`)
10. **嬰兒與母親** (`mababy`, `https://www.mababy.com/`)
11. **醫聯網（We Get Care）** (`wegetcare`, `https://www.wegetcare.tw/blogpost`)
12. **杜蕾斯專欄** (`durex`, `https://www.durex-store.com.tw/v2/shop/InfoModuleList#!/ArticleList`)
13. **HARU 知識專區** (`letsharu`, `https://letsharu.com/haruarticle/`)
14. **UNIQMAN 男性保健專欄** (`uniqman`, `https://www.uniqman.com.tw/blogs`)
15. **潮性辦公室** (`sfunhk`, `https://www.sfunhk.com/blog/posts`)

---

## Architectural Decisions & Standards

1. **Category Routing**:
   - CDC feeds and hospital sources (`cdc`, `ntuh`, `ntuh_ifc`, `femh`) are assigned to `gov` category (`SOURCE_CATEGORIES` key `gov`, green badge).
   - Commercial media, magazines, and wellness brands (`womenshealth`, `top1health`, `helloyishi`, `mababy`, `wegetcare`, `durex`, `letsharu`, `uniqman`, `sfunhk`) are assigned to `media` category (`SOURCE_CATEGORIES` key `media`, indigo badge).

2. **Copyright & Summary-Only Ingestion**:
   - All commercial media and brand articles store `title`, `description_text`, `canonical_url`, `published_at_utc`, `image_url` (or OpenGraph fallback), with `detail_html` and `detail_text` remaining `null` (`skipDetailFetch: true`).
   - Official/hospital announcements parse article descriptions and public announcement snippets cleanly.

3. **In-process Ingestion & Cron Integration**:
   - Synchronized on the existing 30-minute interval (`"5,35 * * * *"` in `lib/server/cron/registerJobs.ts`).
   - Uses `withAdvisoryLock("rss_ingestion_lock")` and `getExistingPayloadHashes` to skip unchanged items, ensuring zero wasted AI SEO calls and minimal DB writes.

4. **Network & TLS Resilience**:
   - Individual fetch errors or strict WAF blocking (e.g. NTUH datacenter firewall rules) are caught, logged, and isolated to prevent impacting the rest of the ingestion batch.

---

## Technical Specifications

### A. RSS Feeds Configuration (`lib/server/config/rss-feeds.ts`)
- `womenshealth_tw`: URL `https://www.womenshealthmag.com/tw/rss/default.xml`, `skipDetailFetch: true`, sourceName `womenshealth`
- `cdc_outbreak`: URL `https://www.cdc.gov.tw/RSS/RssXml/khD5i5xbqmYc8zCDhJimNg?type=1`, sourceName `cdc`
- `cdc_letters`: URL `https://www.cdc.gov.tw/RSS/RssXml/VYgwM0EtOqAhCmd0iJrhfg?type=4`, sourceName `cdc`

### B. Special HTML / API Scrapers (`lib/server/rss/`)
Each scraper exports a function conforming to `() => Promise<SpecialSourceFetchResult>`:
- `fetchHelloYishiNews.ts`: Parses Hello 醫師 articles / feeds.
- `fetchMababyNews.ts`: Parses 嬰兒與母親 knowledge articles (`mababy.com`).
- `fetchWeGetCareNews.ts`: Parses 醫聯網 blog posts (`wegetcare.tw/blogpost`).
- `fetchDurexArticles.ts`: Parses Durex article list.
- `fetchHaruArticles.ts`: Parses HARU sexual health articles.
- `fetchUniqmanBlogs.ts`: Parses UNIQMAN health blog articles.
- `fetchSfunhkPosts.ts`: Parses sfunhk posts.
- `fetchFemhResearchNews.ts`: Parses 亞東紀念醫院 news and research items.
- `fetchNtuhNews.ts`: Parses 臺大醫院總院 and 臺大整合醫療 center announcements with TLS/network fallback resilience.

