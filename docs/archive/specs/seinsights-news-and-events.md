# 社企流（Social Enterprise Insights）新聞與活動收錄規格

## 1. 概述 (Overview)

本規格定義並實作將華文界最具影響力的社會創新與永續發展倡議平台「社企流（seinsights.asia）」雙向整合至系統中：
1. **文章專區 (`/section`)** 👉 整合收錄至 `health.j172.tw/news`（健康與生活新聞中心）
2. **活動專區 (`/event`)** 👉 整合收錄至「全國藝文展覽與活動查詢」(`app/tools/cultural-events`)

依據 GRILL ME 決策對齊（4 項全數通過）：
1. **新聞分類群組**：歸屬於 `npo`（公益社福 / 社會創新），來源標籤名稱為「社企流」。
2. **新聞呈現模式**：採用精選卡片摘要與首圖，點擊導流回原站閱讀 (`skipDetailFetch: true`)，尊重原創版權與排版。
3. **新聞範圍與標籤**：同步最新 3 頁（30 篇），將原生 `section`（專區）與 `category`（分類）合併寫入 `category_tags`，封面圖調用 `downloadArticleImage` 進行本機 WebP 快取。
4. **活動分類歸屬**：歸入 `npo`（🤝 公益活動），主辦單位保留社企流與合作單位。
5. **活動場地深度**：深入解析活動內頁 Draft.js，智慧萃取實體場地與對應縣市；若為線上或無地址則標記為「線上活動 / 全國參與」，截取前 200 字作為摘要。

---

## 2. 來源配置表 (Taxonomy & Configuration)

### 2.1 新聞配置 (`health.j172.tw/news`)
| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **FeedCode** | `seinsights_news` | 註冊於 `types/rss.ts` |
| **SourceName** | `seinsights` | 來源唯一標識 |
| **顯示名稱** | 社企流 | 註冊於 `lib/server/news/sourceLabels.ts` |
| **分類群組** | `npo` (公益社福) | 註冊於 `lib/server/news/sourceCategories.ts` |
| **爬蟲模式** | Next.js Data Listing (`skipDetailFetch: true`) | 讀取 `https://www.seinsights.asia/section?page={1..3}` |
| **文章連結** | `https://www.seinsights.asia/article/{id}` | 原站 Canonical 網址 |
| **分類標籤** | 原生 `section` + `category` | 如「生態環境」、「永續飲食」、「未來地球」 |

### 2.2 藝文活動配置 (`cultural-events`)
| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **UID 前綴** | `seinsights_{id}` | 唯一辨識活動 ID |
| **活動分類** | `npo` | 標籤對應「🤝 公益活動」 |
| **活動列表** | `https://www.seinsights.asia/event` | 讀取 `eventsListInit` |
| **活動內頁** | `https://www.seinsights.asia/event/{id}` | 提取 Draft.js 內文與實體地點/縣市 |
| **線上活動標註** | `線上活動 / 全國參與` | 縣市留空，地點標記為線上 |

---

## 3. 架構與實作細節 (Implementation Details)

### 3.1 新聞模組整合
- **`types/rss.ts`**：擴充 `FeedCode` 聯合型別，加入 `"seinsights_news"`。
- **`lib/server/news/sourceLabels.ts`**：加入 `seinsights: "社企流"`。
- **`lib/server/news/sourceCategories.ts`**：於 `npo` 分類群組加入 `{ sourceName: "seinsights", label: "社企流" }`。
- **`lib/server/rss/fetchNpoSources.ts`**：
  - 實作 `fetchSeinsightsNews(): Promise<NpoFetchResult>`。
  - 爬取前 3 頁 `/section?page=1..3`。
  - 解析 `#__NEXT_DATA__` 中的 `pageProps.sectionObj.posts`。
  - 提取標題、文章 ID、摘要、發布時間、封面圖 WebP 快取、雙層標籤。
- **`lib/server/rss/runIngestion.ts`**：將 `seinsights_news` 納入 NPO 來源群組排程。

### 3.2 藝文活動模組整合
- **`lib/server/culture/ingestSeinsightsEvents.ts`**：
  - 實作 `runSeinsightsEventsSync(): Promise<{ totalFetched: number; insertedOrUpdated: number; errorMessage: string | null }>`。
  - 抓取 `/event` 結構化資料，提取 `eventsListInit`。
  - 逐一抓取活動內頁，解析 Draft.js 內文，萃取場地地址與城市。
  - 寫入 `cultural_events` 與 `cultural_event_shows` 表。
- **`lib/server/cron/registerJobs.ts`**：
  - 在每日藝文同步任務中註冊 `runSeinsightsEventsSync`。

---

## 4. 測試與驗證計畫 (Verification Plan)

### 4.1 自動化單元測試
1. `lib/server/rss/fetchNpoSources.test.mjs`：驗證 `seinsights` 標籤與 `npo` 群組註冊。
2. `lib/server/culture/ingestSeinsightsEvents.test.mjs`：驗證結構化 JSON 解析與地點提取邏輯。

### 4.2 實際爬取驗證
1. 執行 `fetchSeinsightsNews()` 驗證成功抓取 20~30 篇社企流文章與縮圖。
2. 執行 `runSeinsightsEventsSync()` 驗證成功解析社企流活動與線上/線下地點標註。
