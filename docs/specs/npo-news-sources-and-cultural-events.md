# Spec & Ticket: NPO News Sources & Taiwan NPO Center Cultural Events

- **Ticket ID**: `SPEC-HEALTH-20260910-NPO-NEWS-AND-ACTIVITIES`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Closes**: #182
- **Affects**:
  - `types/rss.ts`
  - `lib/server/news/sourceLabels.ts`
  - `lib/server/news/sourceCategories.ts`
  - `lib/server/config/rss-feeds.ts`
  - `lib/server/rss/fetchNpoSources.ts`
  - `lib/server/rss/runIngestion.ts`
  - `lib/server/culture/types.ts`
  - `lib/server/culture/ingestShows.ts`
  - `lib/server/culture/ingestNpoActivities.ts`
  - `lib/server/cron/registerJobs.ts`
  - `app/api/admin/culture-sync/route.ts`
  - `components/Activities/CulturalEventsContent.tsx`
  - `app/tools/cultural-events/page.tsx`
  - `lib/server/rss/fetchNpoSources.test.mjs`

---

## 1. Problem Statement

Prior to this update, Taiwan public health and civic welfare coverage on health.j172.tw was heavily skewed toward commercial media, government press releases, and hospital health education bulletins.

Major Taiwan NGOs/NPOs tackling human rights, vulnerable children, disability support, poverty relief, and environmental advocacy were either absent or unorganized:
1. **Lack of NPO Source Representation**: Reputable organizations such as Amnesty International Taiwan, Taiwan NPO Center, Down Syndrome Foundation, World Vision, Garden of Hope, Syin-Lu, World Peace, and Greenpeace publish timely, high-value field reports and welfare news that was missing.
2. **Media Category Dilution**: Organizations previously grouped under "綜合媒體 (media)" (such as World Peace, Greenpeace, and Independent Broadcast) lacked a dedicated social welfare categorization.
3. **Absence of Community & Welfare Events**: `/tools/cultural-events` exclusively synced Ministry of Culture performing arts and exhibition data. Non-profit community events, charity workshops, and volunteer drives listed on Taiwan NPO Center (`npo.org.tw`) were absent.

---

## 2. Solution Architecture

### 2.1 Dedicated "公益社福" (NPO) Category
Created category `npo` in `lib/server/news/sourceCategories.ts` with badge label `"公益社福"`.
- Grouped 9 sources: `amnesty`, `npo_tw`, `down_syndrome`, `worldvision`, `goh`, `syinlu`, `worldpeace`, `greenpeace`, `ibt`.
- Re-assigned `worldpeace`, `greenpeace`, `ibt` from `media` to `npo`.

### 2.2 News Ingestion Architecture (8 Sources)

1. **勵馨基金會 (`goh`)**:
   - Live native WordPress RSS 2.0 endpoint: `https://www.goh.org.tw/feed/`.
   - Integrated directly into `lib/server/config/rss-feeds.ts` with `skipDetailFetch: true`.
2. **國際特赦組織台灣分會 (`amnesty`)**:
   - Scrapes `https://www.amnesty.tw/news` with Cheerio.
   - Extracts titles, dates (`YYYY-MM-DD`), absolute URLs, and snippets.
3. **台灣公益資訊中心 即時焦點 (`npo_tw`)**:
   - Scrapes `https://www.npo.org.tw/hotmsglist.aspx?tid=127`.
   - Parses ASP.NET grid structure for table rows, title links (`hotmsginfo.aspx?id=...`), dates, and snippets.
4. **中華民國唐氏症基金會 (`down_syndrome`)**:
   - Scrapes `https://www.rocdown-syndrome.org.tw/news/all/1`.
   - Extracts list items, publication dates, and detail article URLs.
5. **台灣世界展望會 (`worldvision`)**:
   - Resolves modern Nuxt 3 server-rendered application at `https://www.worldvision.org.tw/articles/category/7`.
   - Parses the inline `<script>` containing serialized Nuxt state payload (`[["ShallowReactive",1]...`).
   - Extracts article entities: `id`, `title`, `brief`/`description`, `created_at` or `publish_at`, and image asset URLs.
6. **心路基金會 (`syinlu`)**:
   - Scrapes `https://www.syinlu.org.tw/news/index`.
   - Extracts news cards, cover images, title links (`/news/detail/...`), and dates.
7. **世界和平會 (`worldpeace`)**:
   - Scrapes `https://www.worldpeace.org.tw/news_msg.php` and `https://www.worldpeace.org.tw/news_report.php`.
   - Merges results, de-duplicates by URL.
8. **綠色和平 (`greenpeace`)**:
   - Scrapes `https://www.greenpeace.org/taiwan/press-media/press-releases/`.
   - Extracts press releases, published timestamps, and URLs.

All HTML-based fetchers are implemented in `lib/server/rss/fetchNpoSources.ts` and plugged into the unified batch ingestion pipeline in `lib/server/rss/runIngestion.ts`.

### 2.3 Cultural & NPO Activities Sync (`/tools/cultural-events`)

1. **NPO Activity Scraper & Ingester** (`lib/server/culture/ingestNpoActivities.ts`):
   - Scrapes `https://www.npo.org.tw/activitylist.aspx?tid=128`.
   - Parses activity titles, organizers, dates (`YYYY-MM-DD ~ YYYY-MM-DD`), and locations.
   - Infers Taiwan city using `extractCity(location)`.
   - Upserts into `cultural_events` table with:
     - `uid = "npo_" + serno`
     - `category = "npo"`
     - `source_url = "https://www.npo.org.tw/activityinfo.aspx?id=" + serno`
   - Upserts into `cultural_event_shows` table with parsed show dates, venue, and city.
2. **Cron Scheduler** (`lib/server/cron/registerJobs.ts`):
   - Configured recurring job `runNpoActivitiesSync` every 6 hours (`0 */6 * * *`).
3. **Admin Trigger Route** (`app/api/admin/culture-sync/route.ts`):
   - Supports `?category=npo` or syncs NPO activities alongside MOC culture data.
4. **UI Tab & Filter** (`components/Activities/CulturalEventsContent.tsx`):
   - Added `{ key: "npo", label: "公益活動", icon: "🤝" }` tab.
   - Updated SEO keywords in `app/tools/cultural-events/page.tsx`.

---

## 3. Verification & Test Plan

### Automated Tests
- `node --test lib/server/rss/fetchNpoSources.test.mjs`:
  - Amnesty HTML parser verification.
  - NPO Center Hotmsg HTML parser verification.
  - Down Syndrome Foundation HTML parser verification.
  - World Vision Nuxt 3 inline state payload extraction verification.
  - Syin-Lu Foundation HTML parser verification.
- `node --test lib/server/rss/freshness.test.mjs` (23/23 tests pass).
- `npx tsc --noEmit` (Zero TypeScript compilation errors).

### Live Integration Verification
- Live fetch execution against live endpoints:
  - Amnesty: 10 items fetched.
  - NPO Center: 20 items fetched.
  - Down Syndrome: 10 items fetched.
  - World Vision: 10 items fetched.
  - Syin-Lu: 10 items fetched.
  - World Peace: 20 items fetched.
  - Greenpeace: 10 items fetched.
  - NPO Activities: 20 live activities parsed with valid dates, cities, and URLs.
