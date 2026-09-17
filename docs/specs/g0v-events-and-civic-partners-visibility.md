# g0v 活動整合與公民倡議友站能見度升級規格

## 1. 概述 (Overview)

本規格定義並實作以下三大核心升級：
1. **g0v 官方日曆活動整合**：從 `https://g0v.tw/intl/zh-TW/event/` 嵌入之官方 Google Calendar（ICS）整合最新大松、基礎松與社群小聚至「全國藝文展覽與活動查詢」（`/tools/cultural-events`）。
2. **g0v 官網收錄至公民夥伴**：將 `https://g0v.tw/intl/zh-TW/` 以「g0v 零時政府 ↗」納入頁尾與全站公民倡議專欄首位。
3. **公民倡議與友站全站能見度躍升**：
   - 建立全站共用高質感展示元件 `CivicPartnersSection.tsx`，收錄 5 大公民倡議夥伴（g0v 零時政府、黑熊學院、反認知作戰、台灣罪犯圖鑑、2026 政治人物前科）。
   - 於首頁（`/`）主內容下方增設「公民倡議與社會守護」精緻橫向卡片區塊。
   - 於便民生活工具總覽頁（`/tools`）底部增設專屬倡議展示區塊。

依據正體中文 **GRILL ME** 審定共識：
1. **活動資料源機制**：精確遵照使用者指示「僅直接爬取 `https://g0v.tw/intl/zh-TW/event/` 靜態頁面中的日曆資訊，維持原有 KKTIX 獨立連結」，以原生 ICS 解析器抓取 `https://calendar.google.com/calendar/ical/cpcf6iv5pt9l6gl2ue3svo63e8%40group.calendar.google.com/public/basic.ics`。
2. **活動分類與導流**：歸入 `npo`（標籤「🤝 公益活動」），主辦單位標註「g0v 零時政府」，推廣來源連結統一指向 `https://g0v.tw/intl/zh-TW/event/`。
3. **能見度提升決策**：採「多點位聯動」，於首頁與 `/tools` 總覽頁以玻璃態特色卡片展示 5 大友站（含徽章標籤、使命介紹與外連圖示）。

---

## 2. 來源配置與 5 大公民夥伴對照

| 友站名稱 | 官方網址 | 分類定位 | 核心使命標籤 |
| :--- | :--- | :--- | :--- |
| **g0v 零時政府** | `https://g0v.tw/intl/zh-TW/` | 開源公民科技與公共參與 | 公民科技 ‧ 開源參與 |
| **黑熊學院** | `https://kuma-academy.org/` | 全社會防衛韌性與民防教育 | 全社會防衛 ‧ 民防教育 |
| **反認知作戰教育資源網** | `https://cw.yueyuknows.com/` | 假訊息辨識與資訊戰防禦 | 資訊防衛 ‧ 假訊息辨識 |
| **台灣罪犯圖鑑** | `https://metawilo.com/` | 性侵害性騷擾加害者名單公開 | 兒少保護 ‧ 防範再犯 |
| **2026 政治人物前科** | `https://council2026.taiwangogo.tw/` | 議員與縣市長刑事紀錄透明查詢 | 陽光政治 ‧ 透明監督 |

---

## 3. 架構與實作細節

### 3.1 g0v 行事曆活動模組 (`lib/server/culture/ingestG0vEvents.ts`)
- `parseIcsDate(raw: string)`：支援 `YYYYMMDD` 與 `YYYYMMDDTHHmmssZ` 格式，精準轉換為臺灣時間（Asia/Taipei）字串。
- `parseG0vCalendarIcs(icsText: string, minStartDate?: string)`：展開 RFC 5545 行折疊，提取 `VEVENT`，過濾行政提醒事項（如 `[domain]`），提取地址縣市，推廣來源設定為 `https://g0v.tw/intl/zh-TW/event/`。
- `runG0vEventsSync()`：同時抓取 KKTIX 與 Google Calendar ICS，去重寫入 `cultural_events` 與 `cultural_event_shows`。

### 3.2 倡議展示元件 (`components/Common/CivicPartnersSection.tsx`)
- 5 大夥伴卡片採用高規格 Tailwind 設計，包含深淺色模式支援、無障礙語意標籤與外連微動效。
- 首頁（`StabloNewsLayout.tsx`）與工具總覽（`app/tools/page.tsx`）無縫整合。

### 3.3 頁尾與多語系 (`SiteFooter.tsx` & `locales/*.json`)
- `civicPartnerLinks` 首位納入 g0v，中英字典補齊 `footer.g0v`。

---

## 4. 驗證與測試結果

- `lib/server/culture/ingestG0vEvents.test.mjs`：6/6 通過。
- `lib/server/tools/footerLinks.test.mjs`：6/6 通過。
- `npm test`：全域單元測試回歸驗證通過。
