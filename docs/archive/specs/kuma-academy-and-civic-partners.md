# 黑熊學院新聞、行事曆與頁尾公民倡議友站整合規格

## 1. 概述 (Overview)

本規格定義並實作以下三大核心功能：
1. **黑熊學院新聞 (`/article-list?type=news`)** 👉 整合收錄至新聞中心（`health.j172.tw/news`）。
2. **黑熊學院行事曆 (`/calendar`)** 👉 整合收錄至「全國藝文展覽與活動查詢」（`health.j172.tw/tools/cultural-events`）。
3. **頁尾友站專欄** 👉 於全站頁尾（`SiteFooter`）新增「公民倡議與友站」獨立專欄，收錄黑熊學院、反認知作戰、台灣罪犯圖鑑與 2026 政治人物前科查詢。

本規格完全依據正體中文 **GRILL ME** 深度訪談審定共識執行：
1. **新聞分類群組**：歸屬於 `npo`（公益社福 / 社會倡議），來源標籤名稱為「黑熊學院」（代碼 `kuma`）。
2. **新聞呈現模式**：採用精選摘要卡片 + 原站導流閱讀（`skipDetailFetch: true`），調用 `downloadArticleImage` 落地快取 WebP 首圖，提取原生分類與標籤寫入 `category_tags`。
3. **活動分類歸屬**：歸入 `npo`（標籤「🤝 公益活動」），主辦單位標註「黑熊學院」，若是親子營加註親子友善標籤。
4. **活動場次展開**：解析各開課梯次之具體地址、開課時間、結束時間與縣市（對齊 `TAIWAN_COUNTIES` 正體「臺」），展開至 `cultural_event_shows` 表，支援縣市與時間跨度精準篩選。
5. **頁尾友站專欄**：於 `SiteFooter.tsx` 建立獨立「公民倡議與友站」欄位，排在所有工具分類的最末欄，附帶外連圖示 `↗`，安全開啟新分頁（`target="_blank" rel="noreferrer noopener"`）。

---

## 2. 來源配置與資料對照 (Taxonomy & Configuration)

### 2.1 新聞模組配置 (`/news`)

| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **FeedCode** | `kuma_news` | 註冊於 `types/rss.ts` |
| **SourceName** | `kuma` | 來源唯一代碼 |
| **顯示名稱** | 黑熊學院 | 註冊於 `lib/server/news/sourceLabels.ts` |
| **分類群組** | `npo` (公益社福) | 註冊於 `lib/server/news/sourceCategories.ts` |
| **資料來源網址** | `https://api.kuma-academy.org/article?type=news&page=1&rows_per_page=20` | 官方 JSON API |
| **文章連結** | `https://kuma-academy.org/article/{id}` | 原站 Canonical 網址 |
| **收錄模式** | `skipDetailFetch: true` | 卡片精選摘要展示，點擊導流原站閱讀 |

### 2.2 藝文活動模組配置 (`/tools/cultural-events`)

| 屬性 | 設定值 | 說明 |
| :--- | :--- | :--- |
| **UID 前綴** | `kuma_slot_{id}` | 唯一識別開課場次 ID |
| **活動分類** | `npo` | 標籤對應「🤝 公益活動」 |
| **主辦單位** | 黑熊學院 | 保留主辦機構標章 |
| **資料來源網址** | `https://api.kuma-academy.org/course_in_person_slots?is_show_on_calendar=1` | 官方行事曆排程 API |
| **縣市對照** | `KUMA_CITY_MAP` (1..22) | 映射至官方正體「臺北市」、「臺中市」、「臺南市」等 |
| **活動推廣網址** | `https://kuma-academy.org/calendar` | 官方報名與行事曆總覽 |

### 2.3 頁尾公民倡議友站專欄 (`SiteFooter`)

| 網站名稱 | 網址 | 分類定位 | 屬性標記 |
| :--- | :--- | :--- | :--- |
| **黑熊學院** | `https://kuma-academy.org/` | 全民國防、民防演習與災害應變倡議 | `target="_blank"` |
| **反認知作戰** | `https://cw.yueyuknows.com/` | 假訊息辨識、資訊戰研究與媒體素養 | `target="_blank"` |
| **台灣罪犯圖鑑** | `https://metawilo.com/` | 性侵害與性騷擾加害者公開名單、兒少保護 | `target="_blank"` |
| **2026 政治人物前科** | `https://council2026.taiwangogo.tw/` | 議員與縣市長參選人刑事紀錄、陽光政治 | `target="_blank"` |

---

## 3. 架構與實作細節 (Implementation Details)

### 3.1 新聞模組 (`fetchNpoSources.ts` & `runIngestion.ts`)
- 實作 `fetchKumaNews(): Promise<NpoFetchResult>`：
  - 抓取官方 API 最新 20 篇新聞。
  - 擷取標題、發布時間（轉 UTC）、摘要、首圖 WebP 下載快取。
  - 原生 category 與 tag 合併寫入 `categoryRaw`。
- 註冊於 `runIngestion.ts` 之 `npoSources` 批次同步排程中。

### 3.2 藝文活動模組 (`ingestKumaEvents.ts`)
- 實作 `runKumaEventsSync(): Promise<IngestKumaEventsResult>`：
  - 抓取 `/course_in_person_slots?is_show_on_calendar=1`。
  - 解析開課場次、實體開課地點與縣市、開始/結束時間。
  - 寫入 `cultural_events` 與 `cultural_event_shows` 表。
- 註冊於 `lib/server/cron/registerJobs.ts`（每 6 小時例行同步）。
- 支援管理員端點 `app/api/admin/culture-sync/route.ts`（`type=kuma` 或 `type=all`）。

### 3.3 頁尾與多語系 (`SiteFooter.tsx` & `locales/*.json`)
- 新增 `FooterExternalLink` 支援外連安全屬性與色彩轉場。
- 新增 `civicPartnerLinks` 列表與 `footer.civicPartners` 欄位。
- 於 `zh-TW.json` 與 `en.json` 提供完整中英對照。

---

## 4. 測試與驗證 (Verification)

- `node --test lib/server/rss/fetchNpoSources.test.mjs`：7/7 通過（含黑熊新聞 API 實際連線與欄位解析驗證）。
- `node --test lib/server/culture/ingestKumaEvents.test.mjs`：3/3 通過（含黑熊行事曆欄位與縣市提取驗證）。
- `node --test lib/server/tools/footerLinks.test.mjs`：6/6 通過（含頁尾 4 個公民夥伴連結存在性與 HTTPS 驗證）。
- `npm test`：全域單元測試回歸驗證全數通過。
