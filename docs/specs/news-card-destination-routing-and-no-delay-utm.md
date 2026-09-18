# 新聞卡片官方/非官方導外分流、移除 3 秒跳轉與首頁來源多樣性防洗版規格說明書

- **作者**：Antigravity Agent
- **日期**：2026-09-19
- **狀態**：Implemented & Verified
- **關聯 Issue**：https://github.com/j172/health/issues/329 (#329)

---

## 1. 背景與核心痛點

1. **新聞卡片導外體驗不一致與閱讀摩擦**：
   - 過去所有卡片一律點擊進入站內新聞內頁（`/news/[id]`）。但非官方來源（商業新聞媒體、生活雜誌、社福公益）往往只有簡短 RSS 摘要，且爬取全文常遭遇反爬機制或版面混亂。使用者期望點選非官方卡片時，直接在新分頁打開原始網站瀏覽完整內容。
   - 官方機構（衛生福利部、疾病管制署、中央氣象署、食藥署等公立權威單位）則需要保留完整內文收錄與站內文章頁，以利民眾快速查閱權威公報與政策指引。

2. **3 秒中轉等待（`/out?url=...`）體驗不佳**：
   - 原先在新聞內頁點擊「前往官方原始網頁」時，會導向中轉頁並由 `OutRedirectCountdown` 與 `<meta http-equiv="refresh" content="3;...">` 強制倒數 3 秒。此設計增加了不必要的等待，且多次跳轉容易被瀏覽器或使用者誤判為廣告轉址。

3. **世新大學發布日期解析異常與首頁洗版**：
   - 世新大學新聞 Spotlight 輸出的日期格式為純日期 `YYYY-MM-DD`（如 `2026-09-15`）。過去 `parseTaipeiDateToUtc` 僅支援包含時間的格式，解析失敗時降級為爬取當前時間（`now`），導致世新新聞在同一秒大量入庫並在首頁最新消息形成洗版現象。

---

## 2. GRILL ME 審定架構與設計決策

### 2.1 卡片點擊官方與非官方精準分流
- **統一分流入口**：在 `lib/format/outboundLink.ts` 定義 `getArticleDestination`。
- **官方機構來源**：
  - 由 `lib/server/news/sourceCategories.ts` 的 `isGovSource` 判定（涵蓋 `mohw`、`hpa`、`cdc`、`tfda`、`nhi`、`moenv`、`cwa` 等 20+ 個中央公立機構）。
  - 返回站內路由 `{ href: "/news/[id]", isExternal: false }`，使用者點擊進入站內文章內頁瀏覽全文。
- **非官方機構來源**：
  - 新聞媒體、社福、校園（如 `ltn`、`shih_hsin`、`heho`、`twreporter` 等）。
  - 直接返回帶有 UTM 的外部原始連結 `{ href: taggedUrl, isExternal: true, target: "_blank", rel: "noopener noreferrer" }`，點擊即以新分頁開啟原始網站。
- **全站全面套用**：
  - `components/News/NewsCard.tsx`（水平與網格卡片、封面圖、標題、閱讀更多按鈕）。
  - `components/News/HeroPost.tsx`（首頁頂部大圖 Hero 與 Secondary 卡片）。
  - `components/News/NewsSidebar.tsx`（側欄熱門推薦）。

### 2.2 UTM 命名規範體系
- **標準參數**：
  - `utm_source`: `health.j172.tw`
  - `utm_medium`: 依版位分流（一般卡片為 `news_card`、頂部焦點為 `hero_post`、側欄為 `news_sidebar`、外部直連預設為 `news_outbound`）。
  - `utm_campaign`: `news_source`
- **原站參數保護**：
  - 嚴格保留原始網址既有之 query 參數與 `utm_source`，不進行覆蓋。

### 2.3 徹底移除全站 3 秒跳轉
- **移除倒數計時組件**：從 `app/(site)/out/page.tsx` 中徹底刪除 `OutRedirectCountdown` 與 `<meta http-equiv="refresh" content="3;...">`。
- **伺服端 0 秒即時轉址**：歷史書籤或舊外鏈造訪 `/out?url=...` 時，於伺服端驗證合規性後，立即調用 Next.js `redirect(targetUrl)`（HTTP 302/307），0 延遲前往目標。
- **內頁按鈕直開新分頁**：官方新聞內頁之「前往官方原始網頁」按鈕，直接使用 `target="_blank"` 開啟外部原站，不再經過 `/out` 中轉。

### 2.4 非官方內頁防呆、爬蟲純化與 Sitemap
- **內頁直接造訪防呆**：若訪客直接在瀏覽器輸入網址造訪非官方新聞內頁 `/news/[id]`，伺服端自動 302 重定向至外站原始網址並附帶標準 UTM。
- **爬蟲輕量化**：`lib/server/rss/runIngestion.ts` 的 `enrichItem` 中，非官方來源直接標記 `skipDetail = true`，不再爬取與儲存內文 HTML，避免反爬、廣告干擾與資源消耗。
- **Sitemap 清理**：`lib/server/news/queries.ts` 中的 `listNewsForSitemap` 與 `listRecentNewsForNewsSitemap` 加上官方來源白名單篩選，避免 Google Search Console 產生 302 警告。

### 2.5 世新日期解析修復與首頁多樣性演算法
- **日期解析支援純日期**：`lib/server/rss/time.ts` 支援 `YYYY-MM-DD` 台北時間 `00:00:00`，保證世新新聞以真實發布日排序。
- **首頁來源多樣性防洗版**：`lib/server/news/queries.ts` 實作 `listDiverseHomeNews(54, 3)` 與 `applySourceDiversity`，限制單一來源在首頁最多出現 3 篇，保留新聞生態多元性。
- **歷史校正腳本**：提供 `scripts/repair-shih-hsin-dates.mjs` 供資料庫既有資料修復。

---

## 3. 測試與驗證

1. **單元測試**：
   - `tests/outboundLinkUtm.test.mjs`（9/9 通過）
   - `lib/server/news/listDiverseHomeNews.test.mjs`（2/2 通過）
   - `lib/server/rss/time.test.mjs`（5/5 通過）
   - `lib/server/rss/fetchShihHsinNews.test.mjs`（3/3 通過）
2. **型別檢查**：
   - `npx tsc --noEmit`（0 errors）
