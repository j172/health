# 數位發展部（MODA）新聞發布來源整合規格

- **作者**：Antigravity（grill 會話收斂）
- **日期**：2026-09-26
- **狀態**：Approved，待實作與上線

## 1. 背景與現況調查

使用者反映台灣各部會多數提供 RSS 供訂閱與聯播，唯獨數位發展部（MODA）新聞發布頁面（`https://moda.gov.tw/press/press-releases/372`）找不到 RSS 訂閱連結。

經底層探索查證：
1. **無公開 RSS/Atom Feed**：
   - 官方首頁與公告頁面未嵌入 `<link rel="alternate" type="application/rss+xml">`。
   - `/rss`、`/rss.xml`、`/feed`、`/press/press-releases/rss` 等常見路徑實測全數回傳 `404 Not Found`。
2. **無公開直接回傳 JSON 的端點**：
   - 官網切換分頁發出的請求為 `POST https://www-api.moda.gov.tw/WebsiteList/NewsList`，帶 JSON payload（`{"Lang":"zh-tw","MainSN":372,"P":1,"DisplayCount":15}`），但其回傳內容為**伺服器端渲染的 HTML 片段**（SSR HTML），而非乾淨 JSON。
   - 政府資料開放平臺（data.gov.tw）僅有資通安全署新聞稿資料集，缺乏數發部本部新聞稿的即時資料集。
3. **資料提取可行性**：
   - 首頁 `https://moda.gov.tw/press/press-releases/372` 帶有完整的靜態渲染清單（`#ListTable li`），包含標題、日期、司署單位與主題標籤。
   - 分頁與歷史回溯可透過 `https://www-api.moda.gov.tw/WebsiteList/NewsList` 的 POST 介面拉取對應頁數之 HTML 進行解析。

## 2. 規格設計

### 2.1 來源識別與分類
- **`sourceName`**：`"moda"`
- **`feedCode`**：`"moda_press"`
- **`feedName`**：`"數位發展部－新聞發布"`
- **來源屬性**：官方機構（`gov`），隸屬 `SOURCE_CATEGORIES` 的 `gov` 群組。
- **顯示標籤**：`"數位發展部"`。

### 2.2 收割策略（雙模架構）
- **日常排程（預設）**：
  - 呼叫 `GET https://moda.gov.tw/press/press-releases/372`，直接由首頁解析最新 15 筆新聞。
  - 對伺服器最友善、輕量且不依賴內部 API 異動。
- **歷史回溯（Backfill）**：
  - 支援傳入 `pages` 參數（例如回溯 2~3 頁，每頁 15 筆，共約 30~45 筆）。
  - 當 `page > 1` 時，呼叫 `POST https://www-api.moda.gov.tw/WebsiteList/NewsList`，依序解析第 2..N 頁 HTML。
  - 回溯上限嚴格落在 90 天新鮮度閘門（`FRESHNESS_WINDOW_DAYS = 90`）之內，避免被 `runIngestion` 攔截。
- **全量收錄**：
  - 不設關鍵字門檻，完整保留 MyData、數位憑證皮夾、離島海纜、5G 建設、科技災防、AI 發展與資安防詐等所有公共政策與便民措施。

### 2.3 內文精準擷取（Detail Page Scoping）
- 數發部新聞內文頁（`https://moda.gov.tw/press/press-releases/<id>`）之內文皆位於 `div.article1.cpArticle`。
- 在 `lib/server/rss/fetchDetailPage.ts` 中的 `DETAIL_TEXT_SCOPING` 註冊：
  ```ts
  "moda.gov.tw": {
    mode: "only",
    selector: "div.article1.cpArticle",
  }
  ```
  確保去除上方導航、側邊欄、社群分享列、頁面評分與頁尾，保留最純淨的正文，並由既有機制自動下載 `og:image` 與附件。

## 3. 實作變更清單

1. **`lib/server/rss/fetchModaNews.ts`**（新建）：
   - `parseModaHtml(html: string): EnrichedRssItem[]` 純解析函式。
   - `fetchModaNews(options?: { pages?: number }): Promise<ModaNewsFetchResult>`。
2. **`lib/server/news/sourceLabels.ts`**：
   - 新增 `moda: "數位發展部"`。
3. **`lib/server/news/sourceCategories.ts`**：
   - 在 `gov` 分類中新增 `{ sourceName: "moda", label: "數位發展部" }`。
4. **`lib/server/rss/fetchDetailPage.ts`**：
   - 在 `DETAIL_TEXT_SCOPING` 加入 `"moda.gov.tw"` 精準選擇器。
5. **`lib/server/rss/runIngestion.ts`**：
   - 引入 `fetchModaNews` 並掛載至 `processSpecialSource` 排程。
6. **`lib/server/rss/fetchModaNews.test.mjs`**（新建）：
   - 單元測試（Mock HTML 解析、日期解析、分類註冊）。
7. **`scripts/probe-moda-news.mjs`**（新建）：
   - 輕量連線驗證與回溯測試腳本。
