# Feature Specification: News Card Image Extraction, Dual-Track Scheduling & DB Performance Optimization

- **狀態**：Approved (經正體中文 Grill Me 深度審定共識)
- **領域**：RSS 圖片採集、HTTP Client 下載防護、結構化 JSON-LD 擷取、雙軌容錯排程（In-App + GHA）、資料庫複合索引、OG 回填隊頭阻塞防護
- **目標**：修復全站「新聞卡片圖片非常少」的問題，解決「排程不一致且新聞未維持最新」的架構弱點，並消除 `/news?group=gov` 慢查詢造成的 HTTP 502 逾時。

---

## 1. 背景與根本問題

1. **RSS 規格圖片欄位遺漏**：
   - 許多新聞源（如 Yahoo奇摩新聞）在 RSS XML 中將真實採訪照置於 `<content:encoded>`、`<enclosure>`、`<media:content>` 或 `<media:thumbnail>`。
   - 原 `normalizeItem.ts` 僅解析 `description`，丟棄了現成的原廠圖片，造成入庫即缺圖。
2. **圖片下載缺少擬真 Header 遭 CDN 403 阻擋**：
   - `downloadArticleImageDetailed()` 調用底層 `httpRequest()` 時未帶 `User-Agent` 與 `Referer`，導致台灣各大新聞 CDN（如 pgw.udn.com.tw、Yahoo、Mamaclub 等）直接判定為爬蟲並返回 HTTP 403。
3. **元資料解析層缺少 JSON-LD 支援**：
   - 外部爬蟲與 OG 解析器僅檢查 `og:image` / `twitter:image`，忽略了現代媒體廣泛採用的 Schema.org `NewsArticle.image` / `thumbnailUrl`。
4. **排程不一致與單軌 In-App 容易靜默中斷**：
   - `README.md` 記載舊式主機 crontab，但實作早已移入 Next.js In-App node-cron。
   - 主機共享環境（768MB 記憶體上限）常因重啟重置 in-memory 排程；而 GHA 上的 `rss-sync-manual.yml` 僅能手動觸發，缺乏外部自動心跳。
5. **資料庫缺少關鍵索引引發 502 逾時**：
   - `news_items` 表缺少 `(source_name, published_at_utc)` 索引，且列表查詢包含 `ORDER BY COALESCE(published_at_utc, first_seen_at_utc) DESC`，導致每次分組查詢執行全表掃描＋Filesort，耗時超過 40 秒並佔滿連線池，連帶拖垮排程寫入。
6. **GHA OG 回填隊頭阻塞**：
   - 當部分文章原廠完全無圖時，未設定有效重試熔斷門檻，造成排程反覆抓取失敗文章。

---

## 2. 審定規格與實施細節

### 2.1 採集層提取與下載通訊防護
- **`types/rss.ts`**：`NormalizedRssItem` 擴充 `leadImageUrl?: string | null`。
- **`lib/server/rss/normalizeItem.ts`**：
  - 解析 `<enclosure url="..." type="image/...">`。
  - 解析 `<media:content>` 與 `<media:thumbnail>`。
  - 解析 `<content:encoded>` 與 `descriptionHtml` 內的直連圖片或 `<img>` 標籤。
  - 過濾 `logo|favicon|sprite|placeholder|default_logo` 等無效佔位圖。
- **`lib/server/rss/runIngestion.ts`**：
  - 在 `enrichItem()` 中，若 `item.leadImageUrl` 存在，立即調用 `downloadArticleImage` 進行本地化下載與快取，直接寫入 `detail.assets`。
- **`lib/server/images/downloadArticleImage.ts`**：
  - 在 `downloadArticleImageDetailed()` 中為 `httpRequest()` 加入 Chrome 124 擬真 `User-Agent`、`Accept-Language` 及對應來源 origin 的 `Referer`，消除 CDN 403 拒絕。

### 2.2 結構化 JSON-LD 與隊頭阻塞熔斷
- **`lib/server/images/fetchOpenGraphImage.ts`** & **`scripts/gha-og-external-backfill.mjs`**：
  - 擴充 Cheerio 解析，提取 `<script type="application/ld+json">` 中的 `image` 與 `thumbnailUrl`（支援 string、Array、ImageObject）。
  - 加入 `<link rel="image_src">` 支援。
- **`lib/server/news/backfillOgImages.ts`**：
  - 在 `listMissingCardImageTargets()` 中加入 `AND n.image_backfill_attempts < 3` 熔斷門檻，嘗試失敗達 3 次即退出隊列，交由 Tier 2/3 承接，根治隊頭阻塞。

### 2.3 資料庫複合索引與慢查詢優化
- **`lib/server/db/schema.ts`** & **`lib/server/db/mysql.ts`**：
  - 在 `TABLE_DDL.newsItems` 加入 `KEY idx_news_source_published (source_name, published_at_utc)`。
  - 在 `ensureSchema()` 新增安全無損遷移：
    ```sql
    ALTER TABLE news_items
      ADD INDEX IF NOT EXISTS idx_news_source_published (source_name, published_at_utc);
    ```

### 2.4 雙軌容錯排程與文件同步
- **`.github/workflows/rss-sync-manual.yml`**：
  - 重新命名為 `RSS Ingestion Sync (Scheduled & Manual)`。
  - 加入定時排程 `cron: "18,48 * * * *"`，每 30 分鐘錯開 In-App cron（:05/:35）發起非同步 SSH loopback 喚醒，作為可靠的外部保險心跳。
- **`README.md`**：
  - 更新排程說明章節，準確記載 In-App node-cron 與 GitHub Actions 雙軌架構。

---

## 3. 驗證結果

- **單元測試**：新增 `tests/rssLeadImageExtraction.test.mjs`，測試 5 項涵蓋 enclosure、media:content/thumbnail、Yahoo encoded、HTML 提取與 logo 過濾，全數 100% 通過。
- **全站測試**：執行 `npm test`，全站 327 項測試全數通過（0 failure, 0 error）。
- **靜態型別**：執行 `npx tsc --noEmit`，型別檢查 0 錯誤。
- **代碼風格**：異動檔案經 `eslint` 檢查，0 warning 0 error。
