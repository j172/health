# g0v 零時政府公民黑客松與社群活動收錄規格

## 1. 概述 (Overview)

本規格定義並實作將台灣知名開源公民科技社群「g0v 零時政府（g0v.tw）」之雙月黑客松（大松）、基礎松及事實查核等近期公開活動，收錄整合至「全國藝文展覽與活動查詢」(`app/tools/cultural-events`)。

依據 GRILL ME 決策對齊：
1. **資料來源管道**：串接 `https://g0v.tw/intl/zh-TW/event/` 官方指定之社群 KKTIX 公開組織資料來源（`events.json`），享有即時、精準的結構化時間與地點。
2. **分類標籤歸屬**：統一歸類為「🤝 公益活動 (`npo`)」，主辦單位精準標記為「g0v 零時政府揪松團」或「Cofacts 真的假的」。
3. **專案收錄範圍**：聚焦收錄持續高度活躍之「g0v 揪松團（大松）」與「Cofacts 真的假的（查核協作培訓）」之進行中與近期活動。

---

## 2. 來源配置表 (Taxonomy & Configuration)

| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **UID 前綴** | `g0v_kktix_{id}` | KKTIX 活動網址後綴或唯一標識 |
| **活動分類** | `npo` | 標籤對應「🤝 公益活動」 |
| **主辦單位** | `g0v 零時政府揪松團` / `Cofacts 真的假的` | 依來源組織動態標記 |
| **主要來源一** | `https://g0v-jothon.kktix.cc/events.json` | 雙月黑客松、基礎松、工作坊 |
| **主要來源二** | `https://cofacts.kktix.cc/events.json` | 每月事實查核培訓小松 |
| **推廣連結** | KKTIX 活動原始報名頁（如 `https://g0v-jothon.kktix.cc/events/...`） | 供民眾直接點擊前往報名 |

---

## 3. 架構與實作細節 (Implementation Details)

### 3.1 活動爬蟲與解析模組 (`lib/server/culture/ingestG0vEvents.ts`)
- 實作 `runG0vEventsSync(): Promise<IngestG0vEventsResult>`。
- 輪詢上述 KKTIX `events.json` 端點。
- 解析 `entry` 結構：
  - **UID**：由 `entry.url` 提煉活動 slug（例如 `g0v_kktix_g0v-hackath73n`）。
  - **標題**：`entry.title`。
  - **活動起訖日期**：
    - 正則解析 `content` 中的 `時間：(\d{4}[/.-]\d{1,2}[/.-]\d{1,2})`。
    - 若無則退回 `published` 日期轉換為 `YYYY/MM/DD`。
  - **詳細地點與縣市**：
    - 正則解析 `content` 中的 `地點：([^\r\n]+)`。
    - 透過 `extractCity(location, locationName)` 自動判定縣市（如「臺北市」），若無實體地址或為線上則標記為「線上活動 / 全國參與」。
  - **活動摘要**：使用 `entry.summary`，若為空則取 `content` 前 250 字。
- 入庫至 `cultural_events` 與 `cultural_event_shows`，以 `withTransaction` 保障一致性。

### 3.2 排程管理整合 (`lib/server/cron/registerJobs.ts`)
- 於文化展演排程（每 6 小時同步一次）中註冊 `runG0vEventsSync`。

---

## 4. 測試與驗證計畫 (Verification Plan)

### 4.1 自動化單元測試 (`lib/server/culture/ingestG0vEvents.test.mjs`)
1. 驗證 KKTIX `content` 文字時間與地點解析邏輯。
2. 驗證實體地址縣市提取與線上活動 fallback。
3. 驗證 `runG0vEventsSync` 匯出正常。

### 4.2 整合驗證
1. 執行 `npm run test` 確保全站測試全數通過。
2. 執行 `npm run typecheck` (`tsc --noEmit`) 確保型別健全。
