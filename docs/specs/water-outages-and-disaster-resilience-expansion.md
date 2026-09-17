# 水資源與環境防災線資料落地與工具升級規格書

- **作者**：Antigravity Agent
- **日期**：2026-09-18
- **狀態**：Implemented & Verified
- **關聯 Issue**：https://github.com/j172/health/issues/327 (#327)

---

## 1. 背景與目標

本站已上線 80 款核心民生、醫療、環境、防災與文化生活工具。
依據對全臺各級政府與公民科技開放資料庫（水利署 OpenAPI/IoT、經濟部 EE501/能源、環境部、交通部 TDX、疾管署、農業部、六都開放資料及 g0v 社群專案）的深入盤點，針對極端氣候、暴雨、強震等天災下之民生用水中斷與複合型災害風險，落實**【水資源與環境防災線】**的「一新建、兩深化」工程：

1. **新建工具：全臺即時停水與供水站地圖 (`/tools/water-outages`)**
   - 解決自來水管線突發破裂、定期計畫性施工停水時，民眾無水可用且難以即時掌握鄰近緊急供水站的痛點。
   - 整合台灣自來水公司與台北自來水事業處即時開放資料。
2. **深化積淹水：`inundation-map` 接入水利署物聯網（`iot.wra.gov.tw`）分鐘級即時感測**
   - 告別過往單純依賴靜態種子或定時統計，即時顯示路面感知器之公分級（cm）水深與溢堤防汛燈號。
3. **深化全臺防災地圖：`disaster-map` 疊加農業部農村水保署土石流警戒圖層**
   - 在避難收容處所地圖中新增可按需開啟之「⚠️ 土石流警戒溪流」圖層，動態標註紅色/黃色警戒、雨量基準值與避難指示。

---

## 2. 資料管線與容錯架構（Resilience Architecture）

依據本站規格書規範（`site-wide-tools-health-audit-and-continuous-monitoring.md`）：
- **全持久化排程庫存架構**：
  - 新增 MySQL 資料表 `wra_water_outages` 與 `moa_debris_flow_alerts`，定時同步並由本地資料庫提供 <50ms 高效能查詢。
- **嚴格防範 Undici WebAssembly 記憶體溢出（OOM 502）**：
  - 後端資料獲取全數使用專案標準之 `httpGetText`（`@/lib/server/net/httpClient`），嚴禁使用 Node 全域 `fetch()`。
- **零卡死無阻斷防護（Zero-Stuck Guard）**：
  - 外部 API 查詢均配置 5 秒逾時截斷與健全之離線備援種子（`WATER_OUTAGES_SEED`、`EMERGENCY_WATER_STATIONS_SEED`、`DEBRIS_FLOW_SEED`），在官方伺服器遇災斷線時依然維持 100% 可用性。

---

## 3. 資料庫 Schema 設計

### 3.1 `wra_water_outages`（自來水停水與臨時供水站表）
- `id`: BIGINT AUTO_INCREMENT PRIMARY KEY
- `outage_id`: VARCHAR(64) UNIQUE
- `title`: VARCHAR(255)
- `county`: VARCHAR(32), `township`: VARCHAR(32)
- `outage_type`: VARCHAR(20) - 'planned' | 'emergency'
- `start_time`: DATETIME, `end_time`: DATETIME
- `affected_areas`: TEXT, `affected_households`: INT
- `contact_phone`: VARCHAR(64)
- `status`: VARCHAR(20) - 'active' | 'scheduled' | 'resolved'
- `water_stations_json`: JSON (收錄鄰近緊急供水站／水車座標、開放時間、型態)
- `lat`: DECIMAL(10, 7), `lng`: DECIMAL(10, 7)
- `source`: VARCHAR(64)

### 3.2 `moa_debris_flow_alerts`（農業部土石流警戒表）
- `id`: BIGINT AUTO_INCREMENT PRIMARY KEY
- `debris_id`: VARCHAR(64)
- `stream_code`: VARCHAR(64) UNIQUE
- `stream_name`: VARCHAR(128)
- `county`: VARCHAR(32), `township`: VARCHAR(32), `village`: VARCHAR(64)
- `alert_level`: VARCHAR(20) - 'yellow' | 'red'
- `rainfall_threshold_mm`: DECIMAL(6, 1)
- `advisory`: TEXT
- `lat`: DECIMAL(10, 7), `lng`: DECIMAL(10, 7)
- `issued_at`: DATETIME

---

## 4. 前端與使用者體驗規範

1. **`water-outages`**：
   - 歸入 Footer 之「防災與安全示警 (`disaster-safety`)」，按正體中文筆劃順序自動對齊。
   - 採用響應式雙軌看板：統計卡片（進行中、預告、戶數、取水點）＋ Leaflet 互動地圖（紅色標註停水多邊形、藍色水龍頭標註供水站與 Google 導航）＋ 縣市即時切換。
   - 內建停水應對指引（抽水馬達防護、食品級儲水、復水初期沖管衛教）。
2. **`inundation-map`**：
   - 即時路面感測站點標記公分級實測水深。
3. **`disaster-map`**：
   - 新增可切換之土石流警戒溪流圖層，降低非汛期視覺干擾。

---

## 5. 測試與驗證

1. **全站工具健康巡檢**：
   - `node scripts/audit-all-tools-health.mjs`
   - 81 / 81 款核心工具通過（0 警告、0 錯誤）。
2. **自動化測試套件**：
   - `npm test`：312 / 312 項測試全數通過（含 `waterOutages.test.mjs`、`footerLinks.test.mjs`、`audit-all-tools-health.test.mjs`、`noServerFetch.test.mjs`）。
