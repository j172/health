# 社團法人中華民國保護動物協會（APA Taiwan）新聞來源收錄規格

## 1. 概述 (Overview)

本規格定義並實作將「社團法人中華民國保護動物協會（APA Taiwan）」之全站最新消息（包含近期活動、動物知識、協會動向等）整合收錄至 health.j172.tw/news。

依據決策對齊（Grilling Review），本來源遵循下列核心設計準則：
1. **先入庫後讀取**：爬取標準化後寫入 `news_items` 與 `news_assets`，完全整合於全站新聞中心、分類篩選與檢索系統。
2. **公益社福歸屬**：歸類於 `npo`（公益社福）群組，來源標籤全名為「社團法人中華民國保護動物協會」。
3. **摘要與縮圖模式 (`skipDetailFetch: true`)**：站內展示精緻卡片、首圖與短摘要，並提供「前往官方原始網頁」按鈕導流回原協會網站，尊重版權並為公益團體導流。
4. **分頁與排程**：每輪爬取前 4 頁（每頁 4 篇，共 16 篇最新動態），兼顧即時性與輕量排程。
5. **本機首圖快取**：自動下載封面圖至 `public/images/news/articles/`，防止外連防盜鏈破圖並加速瀏覽載入。
6. **語意化分類標籤**：預設分類為「動物保護」，針對標題包含活動/講座/志工者標註「動保活動」，照護/醫療/癱瘓者標註「毛孩照護」。

---

## 2. 來源配置表 (Taxonomy & Configuration)

| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **FeedCode** | `apatw_news` | 註冊於 `types/rss.ts` 之 `FeedCode` 聯合型別 |
| **SourceName** | `apatw` | 來源唯一代碼 |
| **顯示名稱** | 社團法人中華民國保護動物協會 | 註冊於 `lib/server/news/sourceLabels.ts` |
| **分類群組** | `npo` (公益社福) | 註冊於 `lib/server/news/sourceCategories.ts` |
| **爬蟲模式** | HTML Listing (`skipDetailFetch: true`) | 由 `lib/server/rss/fetchNpoSources.ts` 抓取前 4 頁 |
| **來源首頁** | `https://www.apatw.org/news` | 涵蓋 `/news/term/6`（近期活動）與 `/news/term/33`（動物知識）等 |

---

## 3. 架構與實作細節 (Implementation Details)

### 3.1 型別定義 (`types/rss.ts`)
- 於 `FeedCode` 聯合型別中擴充 `"apatw_news"`。

### 3.2 來源標籤與分類對照 (`lib/server/news/sourceLabels.ts` & `sourceCategories.ts`)
- `SOURCE_LABELS`: 加入 `apatw: "社團法人中華民國保護動物協會"`。
- `SOURCE_CATEGORIES`: 於 `npo` 分類群組加入 `{ sourceName: "apatw", label: "社團法人中華民國保護動物協會" }`。

### 3.3 爬蟲邏輯實作 (`lib/server/rss/fetchNpoSources.ts`)
- 匯出 `fetchApatwNews(): Promise<NpoFetchResult>`：
  - 輪詢 `https://www.apatw.org/news?page={0..3}`
  - 使用 Cheerio 解析 `.views-row`：
    - 標題與文章連結：`h2.title a`
    - 發布日期：正則比對 `日期[：:]\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})`，轉換為 UTC Date
    - 摘要文字：`.intro-text`
    - 封面縮圖：`.rep-img img`，調用 `downloadArticleImage` 落地至本地快取
    - 語意化分類標籤：`動保活動`、`毛孩照護` 或 `動物保護`
  - 產生標準 `EnrichedRssItem` 並去重。

### 3.4 排程註冊 (`lib/server/rss/runIngestion.ts`)
- 將 `apatw_news` 加入 NPO 來源群組列表，排程執行時自動入庫。

---

## 4. 測試與驗證 (Verification Plan)

### 4.1 自動化測試
- `lib/server/rss/fetchNpoSources.test.mjs`：
  - 驗證 `SOURCE_LABELS` 包含 `apatw`
  - 驗證 `SOURCE_CATEGORIES` 的 `npo` 群組包含 `apatw`
  - 驗證 `fetchApatwNews` 成功匯出

### 4.2 實際爬取驗證
- 執行爬取驗證腳本，確認能順利自 `https://www.apatw.org/news` 取得 16 筆最新文章，且封面圖片成功儲存於本地目錄。
