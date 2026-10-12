# j172tw Healthz 系統架構總覽

> 取代舊的 [SPECIFICATION.md](archive/SPECIFICATION.md)（v2.4.0，2026-08-23，已過時：仍寫 zh-CN、Node 20、29 張表等）。
> 核對基準：`main` @ `7fe098b`（2026-10-12）。網站：[https://health.j172.tw/](https://health.j172.tw/)
> 各子系統的細節、決策與待辦請見 [domains/](README.md#領域文件)。

---

## 1. 產品範圍

臺灣公衛醫療新聞＋便民生活工具＋即時災害環境觀測的整合平台。

| 面向 | 規模 |
|---|---|
| 工具 | 84 個（`TOOL_CATALOG`），其中 33 個可被搜尋引擎索引（`INDEXABLE_SLUGS`），其餘 noindex |
| 新聞來源 | 52 筆 `RSS_FEEDS`＋約 50 個特殊來源爬蟲；分類 gov 24／media 49／npo 29 |
| 頁面路由 | 97 個 `app/tools/*` 目錄（含轉址頁）、新聞、首頁、隱私、無障礙、`/llm-info` |
| API | 93 支 route（其中 `/api/admin/*` 49 支，皆經 `requireAdminSecret` 常數時間比對） |
| 資料表 | 79 個（`lib/server/db/schema.ts`） |
| 測試 | 78 個 `*.test.mjs`（`node --test`）＋2 個 PHP 測試 |

---

## 2. 技術棧

| 層 | 選擇 |
|---|---|
| 框架 | Next.js 16.3（App Router、Turbopack、`distDir: .next3`）、React 19.3、TypeScript 6 |
| 樣式 | Tailwind CSS v4、`next-themes` 深色模式 |
| 地圖 | Leaflet 1.9＋react-leaflet 5，OSM 圖磚（2.0 改國土測繪中心 EMAP） |
| 資料庫 | MariaDB 10.11、`mysql2` 連線池（`connectionLimit: 8`） |
| 排程 | `node-cron`（由 `instrumentation.ts` 啟動）＋GitHub Actions |
| 解析 | `cheerio`（HTML）、`fast-xml-parser`（RSS／XML）、`adm-zip`、`iconv-lite`、`zod`（匯入驗證） |
| 外部 AI | Cloudflare Workers AI（`lib/server/cloudflare/aiClient.ts`，含斷路器） |
| Runtime 相依 | 18 個（2.0 目標 12 個，見 [2.0 PRD](2.0/spec-issue-438.md)） |

---

## 3. 執行環境與硬限制

詳見 [11 主機與維運](domains/11-hosting-ops-incidents.md)。

- HawkHost 共享主機（CloudLinux 8、LiteSpeed、cPanel），與 `bid.j172.tw` 共用帳號。
- PM2 v7 `health-web`，Node v20.20.2（已 EOL，2.0 升 24），`--max-old-space-size=768`。
- CloudLinux：**NPROC 100**、**Entry Processes 20**。
- **禁止**：伺服器端全域 `fetch()`、請求當下 WASM 渲染、Next.js 圖片最佳化（`images.unoptimized: true`）、在主機 `npm ci`。
- 前置 Cloudflare Free：Full (Strict)、Smart Tiered Cache、Bot Fight Mode、`/admin` 與 `/api/admin` 對非台灣或有威脅分數者 Managed Challenge、threat score ≥ 15 封鎖、`/api/` 與 `/admin` 每 IP 10 秒 30 次限流、邊緣注入安全標頭。

---

## 4. 資料流

```
上游（政府開放資料、RSS、媒體網站、TDX、CWA、MOENV…）
   │  伺服器端一律經 lib/server/net/httpClient.ts（node:https，maxResponseBytes 24MB）
   ▼
擷取層：in-app cron（36 個 job）／GitHub Actions（被封 IP 的來源、長批次）
   │  zod 驗證 → ingest_runs / ingest_errors
   ▼
MariaDB（79 表）── facilities（約 29 萬筆、37 種 facility_type）、news_items、各工具專表
   │  memoizeQuery（上限 500 key）
   ▼
Next.js（SSR/ISR，revalidate 多為 300 秒）→ Cloudflare 邊緣快取（s-maxage=60, SWR 600）→ 使用者
```

**核心原則：資料先入 DB、前台只讀 DB、每個工具都有種子備援（零空白）。**

---

## 5. 子系統一覽

| 子系統 | 入口 | 詳見 |
|---|---|---|
| 新聞擷取 | `lib/server/rss/runIngestion.ts`、`persistItems.ts`（唯一寫入者）、90 天新鮮度閘門 | [01](domains/01-news-sources.md) |
| 新聞圖片 | `cardImages.ts`、`backfillOgImages.ts`、Pixabay→Pexels→Unsplash、`ThematicCover` | [02](domains/02-news-images.md) |
| 新聞地標 | `geoExtractor.ts`、`facilityMatch.ts`、`landmarkBackfill.ts` | [03](domains/03-news-geo-landmark.md) |
| 工具目錄與導覽 | `lib/server/tools/catalog.ts`、`ToolPageShell`、`SiteNav`、`SiteFooter` | [04](domains/04-ia-navigation-civic.md) |
| 設施與地理編碼 | `lib/server/facilities/`（TGOS→OpenCage→Nominatim、輪替游標、縣市邊界防護） | [08](domains/08-facilities-geocode-maps.md) |
| 資料表 | `schema.ts`＋`ensureSchema()`（Promise 記憶）＋`migrations/*.sql`（手動） | [09](domains/09-database-data-integrity.md) |
| 排程與 CI | `registerJobs.ts`、`.github/workflows/`（14 個） | [10](domains/10-scheduling-sync-ci.md) |
| 自我修復 | `.remote-health-index.php`、`.pm2-recovery-guard.php` | [11](domains/11-hosting-ops-incidents.md) |
| 側欄小工具 | `useSidebarWidgetData.ts`、`SidebarWidgetShell.tsx` | [12](domains/12-frontend-stability.md) |
| SEO／AI | `lib/server/news/seo.ts`、`sitemap.ts`、`news-sitemap.xml`、`llms.txt`、`/llm-info`、IndexNow | [13](domains/13-seo-performance-i18n-ai.md) |
| 社群草稿 | `lib/server/social/`、`/admin/social-queue` | [04](domains/04-ia-navigation-civic.md) |

---

## 6. 前台功能細節（自舊總規格保留，已核對仍有效）

- **新聞搜尋**：`news_items` 有 `ft_news_search` FULLTEXT（ngram 中文切詞），無結果時退回 `LIKE`。
- **PWA**：`public/sw.js` v2，導覽 Network-First（避免舊文章），靜態資源 Stale-While-Revalidate。
- **閱讀工具**：`ArticleReaderToolbar` 以 Web Speech API 朗讀（0.8–2.0 倍速）；`ImmersiveReaderModal` 沉浸閱讀（字級、行距、純白／米黃／深色主題），具完整對話框無障礙處理。
- **E-E-A-T**：`NewsArticle.author` 為 `NewsMediaOrganization`、`isBasedOn` 指向原始來源；`Organization` 含 `publishingPrinciples` 等；所有新聞與工具頁顯示醫療免責聲明。
- **爬取預算**：新聞分頁 `page > 1`、搜尋結果頁、非預設 page size 一律 `noindex, follow`；News sitemap 只列 48 小時內並附 `<image:image>`。
- **多語系**：zh-TW／en／ja／ko，以 `?lang=` 切換，不改 URL；canonical 錨定 `zh-Hant-TW`。

---

## 7. 部署與驗證

- `deploy-ftps.yml` **只能手動觸發**：merge 到 `main` 不會自動上線。
- 建置在 GitHub Actions，FTPS 上傳 `.next3` 預建置產物與 `next.config.js`，再由主機端 PHP 套用。
- FTPS 與 `--resolve` 鎖定的維運呼叫刻意使用 `--insecure`（主機出示共用憑證），要移除必須改用 `--cacert` 鎖定憑證。
- 部署時段：`:15–:30` 或 `:45–:00`。
- 本機驗證：`npm run typecheck`、`npm test`、`npm run lint`、`npm run build`。
- **部署後必須實打正式 API 與受影響頁面**；測試全綠不代表正式環境安全（#376 教訓）。
