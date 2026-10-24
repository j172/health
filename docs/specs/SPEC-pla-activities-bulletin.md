# 規格書：國防部中共解放軍臺海周邊海空域動態每日公報系統（PLA Activities Bulletin）

- **建立日期**：2026-10-24
- **狀態**：Ready for Implementation (`ready-for-agent`)
- **關聯研究**：[`docs/2.0/opendata-expansion-research.md`](../2.0/opendata-expansion-research.md)
- **主要資料源**：
  - 中華民國國防部全球資訊網「區域動態列表（中共解放軍臺海周邊海、空域動態）」：`https://www.mnd.gov.tw/news/plaactlist`
  - 每日公報細節頁（含官方公報內文與進入臺海周邊空域活動示意圖）

---

## 1. Problem Statement

在台灣當前地緣戰略與民防安全意識提升的背景下，民眾與關注台海局勢之國內外讀者面臨以下痛點：

1. **官方公報格式單一，缺乏結構化速覽與歷史對照**：
   國防部每日定期於上午發布「中共解放軍臺海周邊海、空域動態」新聞公報，內容詳實記錄前日 0600 至當日 0600 之偵獲共機架次、逾越中線架次、共艦艘次及公務船。但目前官網僅以傳統新聞條列呈現，民眾難以一眼捕捉重點數據（如今日是否有踰越中線、海警公務船增減等）。
2. **缺乏時序歷史切換與趨勢掌握**：
   官網歷史文章隨時間分散在各分頁中，讀者若欲回顧前一日、上週或重大演訓期間之活動內文與航跡對比，需在多頁公告中反覆點擊尋找，缺乏流暢的單頁歷史切換與深層連結（Deep Link）支援。
3. **公部門網站偶發連線異常或防盜鏈導致破圖**：
   公報隨附之「進入臺海周邊空域活動示意圖」對於理解空域分佈至關重要，但公部門主機偶有維護、改版或 Referer 檢查阻擋，需要前端具備強韌的 `referrerPolicy="no-referrer"` 與優雅降級（Fallback）機制。
4. **現有新聞系統易遭每日例行公報洗版**：
   若將每日例行性軍事統計當作一般生活/健康新聞發布，會稀釋一般焦點新聞；但若不收錄，又欠缺關鍵的民防示警公開資訊。因此需要獨立專屬工具頁面進行高價值呈現。

---

## 2. Solution

本規格建立專屬的「臺海周邊海空域動態」示警工具與管線：

1. **獨立一級示警工具 (`/tools/pla-activities`)**：
   - 歸類於本站「防災與示警（`disaster-alerts`）」類別，登錄於 `TOOL_CATALOG`，享有完整的 `ToolPageShell`、全站導航選單、麵包屑與 llms.txt 整合。
2. **結構化指標卡片 + 完整官方公報內文 + 示意圖燈箱放大**：
   - 上方頂部設立 4 大 KPI 數據卡：
     1. **共機總數**（偵獲共機 $X$ 架次）
     2. **逾越中線/延伸空域**（逾越中線及北部/西南/東部空域 $Y$ 架次，依數值提供示警色階標籤）
     3. **共艦艘次**（海軍艦艇 $Z$ 艘次）
     4. **公務船艘次**（海警船等 $W$ 艘次）
   - 中間完整保留並優雅排版國防部官方發布之完整每日公報內文，標明監控起訖時段與國軍應處作為。
   - 右側/下方提供「活動示意圖」預覽卡片，支援點擊開啟燈箱（Lightbox）高清檢視，並提供直連國防部原始公告外鏈。
3. **歷史日期快速時間軸與網址深層連結**：
   - 預設焦點展示最新一日公報，下方時間軸羅列近 30 天日期標籤。
   - 點選任一日期，焦點區立即無縫切換為該日之指標、內文與航跡圖，並同步更新網址參數（如 `?date=YYYY-MM-DD`），方便直接分享特定日期。
4. **強韌的資料庫儲存與離線 Seed 機制**：
   - 建立 MySQL `pla_activities` 資料表，由背景同步腳本排程更新入庫。
   - 實作 `withConnectionFallback` 機制，在資料庫離線或無網路開發環境下，自動回退至近 30 天高保真種子檔 `data/pla-activities-seed.json`，達成 0 破圖、0 白畫面、毫秒級 SSR 渲染。

---

## 3. User Stories

1. As a resident in Taiwan, I want to visit `/tools/pla-activities` to instantly see today's PLA aircraft and vessel activity numbers, so that I can quickly assess the current cross-strait security situation.
2. As a reader scanning the bulletin, I want 4 clear KPI cards showing total aircraft, crossed-line aircraft, naval vessels, and official vessels, so that I do not have to parse raw paragraphs manually.
3. As a user checking national defense alerts, I want to read the full verbatim official text released by the Ministry of National Defense, so that I have access to authoritative information without third-party distortion.
4. As a visual learner, I want to inspect the official PLA airspace trajectory map in high resolution with a one-click lightbox zoom, so that I can see the exact intrusion flight paths.
5. As an analyst or citizen following a multi-day drill, I want to click through past dates (up to 30 days) on an interactive timeline to compare today's activity with yesterday or last week without full-page reloads.
6. As a user sharing an alert on social media or messaging apps, I want the URL to update to `?date=YYYY-MM-DD` when selecting a date, so that recipients land directly on the specific day I am sharing.
7. As a mobile visitor with limited bandwidth, I want image requests to include `referrerPolicy="no-referrer"` to bypass official anti-hotlinking blocks without loading failures.
8. As a user visiting when the official image server is temporarily down, I want a graceful fallback message with an external link to the official MND bulletin instead of a broken image icon.
9. As a site visitor navigating via the top header menu, I want to find "臺海周邊海空域動態" conveniently listed under the "防災與示警" dropdown.
10. As an AI agent or LLM reading `llms.txt`, I want to read structured markdown descriptions and FAQs of the tool via `/tools/pla-activities/llms.txt`.
11. As an operator running the site offline or in local CI, I want the application to fall back gracefully to `data/pla-activities-seed.json` so tests pass reliably without network access.
12. As a screen reader user, I want all KPI metric cards, tabs, and image zoom dialogs to feature appropriate ARIA labels and keyboard accessibility (Esc to close lightbox, Tab navigation).
13. As a developer writing integration tests, I want pure regex parser tests verifying extraction against varied bulletin wording (with/without line crossings, missing official ships, etc.).
14. As an automated sync process, I want `scripts/sync-pla-activities.mjs` to idempotently upsert new records into `pla_activities` using `ON DUPLICATE KEY UPDATE` on `activity_date`.
15. As a site administrator, I want server-side caching (`revalidate = 3600`) so downstream traffic does not bombard government endpoints.

---

## 4. Architecture & Technical Specifications

### 4.1 Database Schema (`lib/server/db/schema.ts`)

```sql
CREATE TABLE IF NOT EXISTS pla_activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activity_date DATE NOT NULL,
  period_start DATETIME NULL,
  period_end DATETIME NULL,
  title VARCHAR(255) NOT NULL,
  aircraft_total INT NOT NULL DEFAULT 0,
  aircraft_crossed INT NOT NULL DEFAULT 0,
  vessels_total INT NOT NULL DEFAULT 0,
  official_ships_total INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  aircraft_details TEXT NULL,
  image_url VARCHAR(1000) NULL,
  source_url VARCHAR(1000) NOT NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pla_activities_date (activity_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 Data Ingestion & Bulletin Parser (`lib/server/plaActivities/parser.ts`)

Regex extraction patterns handle official wording variations:
- **總共機數**：`偵獲共機\s*([0-9]+)\s*架次`
- **逾越中線/空域數**：`其中逾越海峽中線.*?([0-9]+)\s*架次`（若無此子句則為 0）
- **共艦數**：`共艦\s*([0-9]+)\s*艘`
- **公務船數**：`公務船\s*([0-9]+)\s*艘`（若無則為 0）
- **時段起訖**：`([0-9]+)年([0-9]+)月([0-9]+)日.*?([0-9]{4})時至.*?([0-9]+)月([0-9]+)日.*?([0-9]{4})時止`

### 4.3 Catalog Registration (`lib/server/tools/catalog.ts`)

- **slug**: `"pla-activities"`
- **group**: `"disaster-alerts"`
- **title**: `"臺海周邊海空域動態"`
- **navLabel**: `"臺海軍機艦動態"`
- **keywords**: `["臺海動態", "中共軍機", "共機擾台", "海峽中線", "國防部公報", "共艦", "空域示意圖", "防空示警"]`
- **scientificBasis**: 國防部全球資訊網區域動態公開資訊
- **faqs**:
  1. 臺海周邊海空域動態資料多久更新一次？
  2. 如何解讀「逾越海峽中線及進入延伸空域」的架次？
  3. 統計時段的「0600時至0600時」代表什麼？
  4. 空域活動示意圖提供哪些資訊？

### 4.4 User Interface Component (`components/Tools/PlaActivitiesContent.tsx`)

- **State Management**:
  - `selectedDate: string` (derived from URL query `?date=...` or defaults to latest activity)
  - `isLightboxOpen: boolean`
- **Features**:
  - 4 Responsive KPI Summary Cards with dynamic alert status color.
  - Verbatim official announcement quote card with copy button.
  - Image preview card with `referrerPolicy="no-referrer"` and click-to-zoom modal.
  - Scrollable 30-day timeline selector with active state badge and count pills.
  - Official source link directing to `mnd.gov.tw`.

---

## 5. Verification & Testing

1. **Parser Tests (`lib/server/plaActivities/parser.test.mjs`)**:
   - Standard day with both crossings and official ships.
   - Day with 0 crossings (e.g. "偵獲共機 6 架次、共艦 4 艘次").
   - Day with high tension / military exercise numbers.
   - Robust error handling for malformed input strings.
2. **Queries & Fallback Tests (`lib/server/plaActivities/queries.test.mjs`)**:
   - Verify `getPlaActivities()` correctly loads from `data/pla-activities-seed.json` when MySQL is offline.
   - Verify date filtering and sorting order (newest first).
3. **Typecheck & Linting**:
   - `npm run typecheck` passes with zero errors.
   - `npm run lint` passes without regressions.
