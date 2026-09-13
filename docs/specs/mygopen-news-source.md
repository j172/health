# MyGoPen 查核中心新聞來源收錄規格

## 1. 概述 (Overview)

本規格定義並實作將台灣知名的民間事實查核與反詐防謠專業組織「MyGoPen（這是假消息）」全站查核報告（涵蓋健康醫療迷思、食品安全闢謠、弱勢福利詐騙、高頻生活釣魚訊息等）收錄整合至 `health.j172.tw/news`（健康與生活新聞中心）。

依據 GRILL ME 決策對齊：
1. **收錄主題範圍**：全站查核報告完整收錄（涵蓋食安、假養生、醫藥闢謠、防詐與生活假訊息），構建全方位生活安全與健康真相防護網。
2. **來源分類群組**：歸屬於 `npo`（公益社福 / 社會創新），顯示標籤名稱為「MyGoPen 查核中心」。
3. **呈現模式與導流**：採用精選摘要卡片 + 原站導流閱讀 (`skipDetailFetch: true`)，提取「你可以先知道」查證精華結論，高畫質首圖落地至本機快取，點擊直接導流至 MyGoPen 官方文章查看完整查核證據。
4. **原生標籤保留**：提取文章自帶之原生標籤（如「食安」、「假養生」、「詐騙」、「中醫」等）寫入 `category_tags` 支援站內分類檢索。

---

## 2. 來源配置表 (Taxonomy & Configuration)

| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **FeedCode** | `mygopen_news` | 註冊於 `types/rss.ts` |
| **SourceName** | `mygopen` | 來源唯一代碼 |
| **顯示名稱** | MyGoPen 查核中心 | 註冊於 `lib/server/news/sourceLabels.ts` |
| **分類群組** | `npo` (公益社福) | 註冊於 `lib/server/news/sourceCategories.ts` |
| **資料來源網址** | `https://www.mygopen.com/feeds/posts/default?alt=rss&max-results=50` | Blogger 原生 RSS 2.0 端點 |
| **文章連結** | `https://www.mygopen.com/YYYY/MM/...html` | 官方原始查核報告網址 |
| **收錄模式** | `skipDetailFetch: true` | 卡片摘要展示與原站導流 |

---

## 3. 架構與實作細節 (Implementation Details)

### 3.1 型別定義 (`types/rss.ts`)
- 於 `FeedCode` 聯合型別中擴充 `"mygopen_news"`。

### 3.2 來源標籤與分類對照 (`lib/server/news/sourceLabels.ts` & `sourceCategories.ts`)
- `SOURCE_LABELS`: 加入 `mygopen: "MyGoPen 查核中心"`。
- `SOURCE_CATEGORIES`: 於 `npo` 群組加入 `{ sourceName: "mygopen", label: "MyGoPen 查核中心" }`。

### 3.3 爬蟲邏輯實作 (`lib/server/rss/fetchNpoSources.ts`)
- 匯出 `fetchMygopenNews(): Promise<NpoFetchResult>`：
  - 請求 `https://www.mygopen.com/feeds/posts/default?alt=rss&max-results=50`
  - 使用 `fast-xml-parser` 解析 XML
  - 提取標題、文章連結、發布時間（轉換為 UTC Date）
  - 從 `item.description` 解析首圖 `<img>` 網址（或 `media:thumbnail` 高解析替代），調用 `downloadArticleImage` 下載快取
  - 提取「你可以先知道」純文字精華段落作為 `description`
  - 萃取 `category` 標籤並以頓號連結寫入 `categoryRaw`
  - 產生標準 `EnrichedRssItem`

### 3.4 排程註冊 (`lib/server/rss/runIngestion.ts`)
- 將 `mygopen_news` 加入 NPO 來源群組排程陣列，標註 `skipDetailFetch: true`。

---

## 4. 測試與驗證計畫 (Verification Plan)

### 4.1 自動化單元測試
- `lib/server/rss/fetchNpoSources.test.mjs`：
  - 驗證 `SOURCE_LABELS` 包含 `mygopen`
  - 驗證 `SOURCE_CATEGORIES` 的 `npo` 群組包含 `mygopen`
  - 驗證 `fetchMygopenNews` 函式匯出與型別

### 4.2 整合驗證
- 執行 `npm run typecheck` 確保型別健全無誤。
- 執行 `npm run test` 確保全站測試全數通過。
