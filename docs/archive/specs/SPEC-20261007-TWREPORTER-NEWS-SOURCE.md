# SPEC-20261007: 《報導者》RSS 新聞來源收錄與導流架構規格

- **Spec ID**: `SPEC-20261007-TWREPORTER-NEWS-SOURCE`
- **Issue**: #428
- **Related Tickets**: [TICKET-20261007-TWREPORTER-NEWS-SOURCE.md](../tickets/TICKET-20261007-TWREPORTER-NEWS-SOURCE.md)
- **Status**: Ready for Implementation
- **Author**: Antigravity (Pair Programming with User)
- **Date**: 2026-10-07

---

## 1. 概述 (Overview)

本規格定義並實作將台灣知名非營利獨立調查媒體「報導者（The Reporter，財團法人報導者文化基金會）」官方全站 RSS Feed（`https://www.twreporter.org/a/rss2.xml`）收錄整合至 `health.j172.tw`（健康與生活新聞中心）。

透過 GRILL ME 嚴格逐項審定，確立以下架構方針：
1. **來源分類群組**：歸屬於 `npo`（公益社福），符合非營利媒體組織屬性與站內分類規範。
2. **收錄範疇與主題策略**：全量收錄（包含專題深度報導、時事評論投書與 Podcast 深度專題，日均 1~2 篇無洗版疑慮）。
3. **呈現模式與外連導流**：採用精選摘要卡片 + 原站導流閱讀 (`skipDetailFetch: true`)。由 RSS 原生 `<enclosure>` 提取高畫質首圖快取至本機；點擊卡片直接導流至報導者原站並附帶標準 UTM，符合其 **CC BY-NC-ND 3.0** 著作權授權規範。
4. **管線整合與自動化**：納入全站標準 `RSS_FEEDS` 自動同步排程，並建立專屬單元測試驗證來源註冊與 Feed XML 解析。

---

## 2. 來源配置表 (Taxonomy & Configuration)

| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **FeedCode** | `twreporter_news` | 註冊於 `types/rss.ts` 之 `FeedCode` 聯合型別 |
| **SourceName** | `twreporter` | 來源唯一代碼 |
| **顯示名稱** | `報導者` | 註冊於 `lib/server/news/sourceLabels.ts` 與 `generate-source-og-images.mjs` |
| **分類群組** | `npo`（公益社福） | 註冊於 `lib/server/news/sourceCategories.ts` |
| **資料來源網址** | `https://www.twreporter.org/a/rss2.xml` | 原生 RSS 2.0 端點 |
| **文章連結** | `https://www.twreporter.org/a/...` | 官方原始文章網址 |
| **收錄模式** | `skipDetailFetch: true` | 卡片摘要展示與原站導流 |
| **首圖提取方式** | `<enclosure url="..." type="image/jpeg"/>` | 由 `normalizeItem.ts` 自動提取並由 `downloadArticleImage()` 下載快取 |

---

## 3. 架構與實作細節 (Implementation Details)

### 3.1 型別定義 (`types/rss.ts`)
- 於 `FeedCode` 聯合型別中擴充 `"twreporter_news"`。

### 3.2 來源標籤 (`lib/server/news/sourceLabels.ts`)
- 在 `SOURCE_LABELS` 對照表新增：
  ```ts
  twreporter: "報導者",
  ```

### 3.3 來源分類群組 (`lib/server/news/sourceCategories.ts`)
- 於 `SOURCE_CATEGORIES` 的 `npo`（公益社福）群組新增：
  ```ts
  { sourceName: "twreporter", label: "報導者" },
  ```

### 3.4 全域 RSS 來源設定 (`lib/server/config/rss-feeds.ts`)
- 於 `RSS_FEEDS` 陣列新增設定物件：
  ```ts
  {
    code: "twreporter_news",
    name: "報導者",
    url: "https://www.twreporter.org/a/rss2.xml",
    sourceName: "twreporter",
    skipDetailFetch: true,
  },
  ```

### 3.5 靜態建置 OG 圖片產生鏡像 (`scripts/generate-source-og-images.mjs`)
- 同步更新 `SOURCE_LABELS` 鏡像字典，加入 `twreporter: "報導者"`。

---

## 4. 測試與驗證計畫 (Verification Plan)

### 4.1 專屬單元測試 (`tests/twreporter-rss.test.mjs`)
撰寫完整測試驗證：
1. `types/rss.ts` 之 `FeedCode` 支援 `twreporter_news`。
2. `lib/server/news/sourceLabels.ts` 之 `SOURCE_LABELS["twreporter"]` 等於 `"報導者"`。
3. `lib/server/news/sourceCategories.ts` 之 `npo` 分類包含 `twreporter` 且 `isGovSource("twreporter")` 為 `false`。
4. `lib/server/config/rss-feeds.ts` 包含 `twreporter_news` 配置，確認其 URL、sourceName 與 `skipDetailFetch === true`。
5. 針對真實 `https://www.twreporter.org/a/rss2.xml` 樣本執行 `normalizeItem`，驗證 `<enclosure>` 圖片正確提取為 `leadImageUrl`。

### 4.2 全站健康檢查
- 執行 `npm test` 確認既有與新增測試全數 PASS。
- 執行 `npm run typecheck` 確保無 TypeScript 型別錯誤。
