# Spec A：TDX「樂齡/敬老」軌道無障礙資料導入，升級 /tools/accessible-transit

- **作者**：Claude (orchestrator)
- **日期**：2026-10-10
- **狀態**：Approved，待開 issue 與 worktree 實作
- **關聯 Issue**：TBD（本 spec 定稿後開立）
- **前置討論**：/grill session，使用者確認範圍、拆分方式與執行順序

---

## 1. 背景與目標

交通部 TDX 新增「Senior（樂齡/敬老）」資料分類，底下 `Rail`（軌道場域）子分類提供 5 個真實 API，涵蓋全台 10 種軌道系統（TRA 臺鐵、THSR 高鐵、TRTC 臺北捷運、NTMC 新北捷運、TYMC 桃園捷運、TMRT 臺中捷運、KRTC 高雄捷運、KLRT 高雄輕軌、NTDLRT 淡海輕軌、NTALRT 安坑輕軌）的車站無障礙設施、服務、導覽圖、跨運具轉乘與設施停用公告資料。

現有 `/tools/accessible-transit`（PR #297 上線）的 `accessible_transit_facilities` / `accessible_transit_routes` 兩張表**目前是寫死的 seed data**（見 `lib/server/transit/data/transitSeed.ts`，`ensureTransitSeeded()` 只在表為空時灌入一次，從未被真實資料覆蓋）。本次目標：

1. 用 TDX 真實資料取代假資料（設施、服務、停用公告 3 個 API 自然套入現有 `accessible_transit_facilities` 表的語意）。
2. 新增導覽圖（WKT 圖資／平面圖連結）與跨運具轉乘兩種全新資料形式，建立對應新表與基礎 UI 呈現。
3. 建立每日排程同步，取代一次性 seed。

不在本次範圍：`accessible_transit_routes`（低地板公車比率）與 `AccessibleTransitHotline`（復康巴士專線）兩張表／資料繼續沿用現有 seed，TDX 本次資料不含公車低地板比率資料，不處理。

---

## 2. TDX API 規格（已由使用者貼出 swagger 內容確認）

Base：`https://tdx.transportdata.tw/api/advanced/v1/Senior/Rail/...`（實際 base path 需在實作時以瀏覽器 Network 面板或 TDX 官方 SDK 確認一次；本類別路徑在 swagger UI 顯示為 `/V1/Senior/Rail/...`，不同於 YouBike 使用的 `/api/basic/v2/...`，很可能屬於進階(Advanced)會員資料，需用已設定好的 TDX_CLIENT_ID/TDX_CLIENT_SECRET 走 OAuth2 client-credentials 取得 token 後呼叫；若回傳 403/401 代表帳號尚未開通此資料集的存取權限，需使用者另行於 TDX 平台申請，不是程式問題）。

| API | 路徑 | 說明 |
|---|---|---|
| 設施 | `GET /V1/Senior/Rail/Station/Facility/{RailSystem}` | 電梯/廁所/坡道/AED/哺乳室等，含座標、樓層、鄰近出入口/月台 |
| 服務 | `GET /V1/Senior/Rail/Station/Service/{RailSystem}` | 導引服務、無障礙計程車、輪椅租借等軟性服務，含電話/網址 |
| 導覽圖 | `GET /V1/Senior/Rail/Station/Map/{RailSystem}` | 平面圖/立體位置圖圖片連結 + WKT 圖資 |
| 跨運具轉乘 | `GET /V1/Senior/Rail/Station/Transfer/{RailSystem}` | 車站出口跨運具轉乘路徑描述 |
| 停用公告 | `GET /V1/Senior/Rail/Station/Facility/Alert/{RailSystem}` | 設施停用起訖時間與原因 |

`RailSystem` 路徑參數列舉：`TRA, THSR, TRTC, NTMC, TYMC, TMRT, KRTC, KLRT, NTDLRT, NTALRT`。每個 API 都要對 10 個系統分別呼叫（部分系統可能回空陣列，正常）。

欄位細節（由使用者貼出的 swagger Example Value 取得，實作時以實際回應為準）：

```ts
// Facility
{
  StationID, StationName, AutorityCode, UpdateTime, UpdateInterval,
  Elevators: FacilityItem[], Toilets: FacilityItem[], AEDs: FacilityItem[],
  PowerBankRentalStations: FacilityItem[], /* 其餘設施類別依實際回應新增 */
}
interface FacilityItem {
  FacilityID, FacilityName, FloorLevel, Description,
  ExitID, ExitName, PositionLon, PositionLat, PlatformID, PlatformName
}

// Service
{ StationID, StationName, ServiceName, Description, ServiceURL, ServicePhone, AutorityCode, UpdateTime, UpdateInterval }

// Map
{ StationID, StationName, FloorLevel, MapName, MapURL, Geometry /* WKT string, 可能為空 */, AutorityCode, UpdateTime, UpdateInterval }

// Transfer
{ StationID, StationName, FloorLevel, ExitID, ExitName, PositionLon, PositionLat,
  TransferRouteDescription, TransferMode, TransferDescription, IsOnSiteTransfer, AutorityCode, UpdateTime, UpdateInterval }

// Facility/Alert
{ AlertID, Reason, StationID, StationName, FacilityID, FacilityName, Description,
  StartTime, EndTime, PublishTime, ExitID, ExitName, AutorityCode, UpdateTime, UpdateInterval }
```

**已知待確認的實作細節**（留給實作者在寫程式時處理，不阻塞 spec 定稿）：
- TDX 回應不含「縣市」欄位，僅有 `AutorityCode`。單一縣市系統（TRTC/NTMC→新北、TYMC→桃園、TMRT→臺中、KRTC/KLRT→高雄、NTDLRT/NTALRT→新北）可直接對應固定縣市；TRA、THSR 橫跨多縣市，需要「車站代碼→縣市」對照表。檢查 repo 內是否已有可重用的 TRA/THSR 站點縣市對照（目前搜尋未發現），否則需自建一份精簡對照表（可用 TDX Basic 的 `/api/basic/v2/Rail/{System}/Station` 一次性抓取站點城市資訊建表，或手動維護靜態表）。
- 確認 base path 是否為 `/api/advanced/v1/Senior/...`（而非 basic）。

---

## 3. 資料庫設計

### 3.1 沿用現表（設施 + 服務 + 既有 seed 共存欄位）

`accessible_transit_facilities` 不改欄位結構，但改寫資料灌入語意與粒度：**一車站一列**（維持現有 UI 的卡片顆粒度），`features_json` 從單純字串陣列擴充為物件陣列以保留明細，同時保留字串陣列相容性：

```sql
ALTER TABLE accessible_transit_facilities
  ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'seed' COMMENT 'seed | tdx_senior',
  ADD COLUMN station_id VARCHAR(32) NULL,
  ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD UNIQUE KEY uniq_station (station_id, system_type);
```

`features_json` 寫入格式改為 `{ tags: string[], items: FacilityItem[] }`（`tags` 給現有 UI 的標籤渲染直接吃，`items` 保留每個設施的樓層/說明/座標供未來明細頁使用）；`lib/server/transit/queries.ts` 的 `features` 回傳型別與讀取邏輯需同步調整（讀 `features_json.tags` 而非整個 JSON 當陣列），`AccessibleTransitFacility` type 增加可選 `featureItems` 欄位。

服務 API（導引服務、無障礙計程車等）比照塞進同一車站列：`service_phone`／`booking_rules` 欄位已存在，多筆服務時以換行或清單文字彙整進 `booking_rules`，服務網址另存進 `features_json.items` 的對應物件。

`ensureTransitSeeded()` 的「兩表 COUNT=0 才灌 seed」邏輯不變 —— 一旦 sync 真實寫入資料，表就不再是空的，seed 自動失效，不需要額外的 migration 刪資料。

### 3.2 新表：設施停用公告

```sql
CREATE TABLE IF NOT EXISTS accessible_transit_facility_alerts (
  alert_id VARCHAR(64) PRIMARY KEY,
  rail_system VARCHAR(16) NOT NULL,
  station_id VARCHAR(32) NOT NULL,
  station_name VARCHAR(128) NOT NULL,
  facility_id VARCHAR(64) NULL,
  facility_name VARCHAR(128) NULL,
  reason VARCHAR(255) NULL,
  description TEXT NULL,
  start_time DATETIME NULL,
  end_time DATETIME NULL,
  publish_time DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_rail_system (rail_system),
  INDEX idx_station (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.3 新表：車站導覽圖

```sql
CREATE TABLE IF NOT EXISTS accessible_transit_station_maps (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rail_system VARCHAR(16) NOT NULL,
  station_id VARCHAR(32) NOT NULL,
  station_name VARCHAR(128) NOT NULL,
  floor_level VARCHAR(32) NULL,
  map_name VARCHAR(128) NULL,
  map_url VARCHAR(512) NULL,
  geometry TEXT NULL COMMENT 'WKT 格式，本次僅儲存不渲染',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_station (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

v1 UI 僅列出 `map_url` 圖片連結（點擊開新分頁看平面圖），不做 WKT 幾何渲染（成本高、非本次重點）；`geometry` 欄位先存起來供未來疊圖功能使用。

### 3.4 新表：跨運具轉乘

```sql
CREATE TABLE IF NOT EXISTS accessible_transit_transfers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rail_system VARCHAR(16) NOT NULL,
  station_id VARCHAR(32) NOT NULL,
  station_name VARCHAR(128) NOT NULL,
  floor_level VARCHAR(32) NULL,
  exit_id VARCHAR(32) NULL,
  exit_name VARCHAR(64) NULL,
  lat DECIMAL(10, 7) NULL,
  lng DECIMAL(10, 7) NULL,
  transfer_mode VARCHAR(32) NULL,
  transfer_route_description TEXT NULL,
  transfer_description TEXT NULL,
  is_onsite_transfer TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_station (station_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

四張表（含沿用表的 ALTER）都要加進 `lib/server/db/schema.ts` 的 `ensureTables`／既有 DDL 清單，照現有慣例（`CREATE TABLE IF NOT EXISTS`，ALTER 用 `ensureColumnExists`-style 的既有 helper，查一下 schema.ts 裡其他地方怎麼做欄位新增的慣例再套用）。

---

## 4. 同步作業設計

新增 `lib/server/transit/tdxSeniorClient.ts`：對 10 個 RailSystem × 5 個 API 發請求的 client 函式。**TDX OAuth2 token 取得邏輯應該跟 `lib/server/youbike/tdxClient.ts` 裡的 `getTdxToken()` 共用**——目前該函式是檔案私有且寫死讀 `TDX_CLIENT_ID`/`TDX_APP_ID`，建議抽成 `lib/server/tdx/auth.ts` 的共用 helper，YouBike 與本功能都改呼叫它，避免兩份重複的 OAuth2 token cache 邏輯。

新增 `lib/server/transit/runSync.ts`：`runTransitAccessibilitySync()`，流程：
1. 取 TDX token（沿用共用 helper）。
2. 迴圈 10 個 RailSystem，平行呼叫 Facility/Service/Map/Transfer（比照 `youbike/tdxClient.ts` 的 `batchSize=3` 分批節流），彙整寫入 §3.1/3.3/3.4 三處。
3. 另外呼叫 Facility/Alert，UPSERT 進 §3.2（`ON DUPLICATE KEY UPDATE` by `alert_id`，比照 `youbike/runSync.ts` 的 upsert 寫法）。
4. 回傳 `{ ok, stationsUpserted, alertsUpserted, mapsUpserted, transfersUpserted, errors[] }` summary。

排程註冊（比照 `lib/server/cron/registerJobs.ts` 既有慣例，直接 `cron.schedule` + `runGuarded`，不要建立新的 GitHub Actions workflow —— 本專案已把這類排程遷移到 in-app cron scheduler，見 `docs/specs/in-app-cron-scheduler.md`）：
- Facility/Service/Map/Transfer：資料本身 `UpdateInterval` 多為 86400（每日），排每日一次，挑一個目前排程表裡沒人用的凌晨分鐘（參考 registerJobs.ts 裡每個 job 註解挑選空檔邏輯）。
- Facility/Alert：`UpdateInterval` 為 -1（事件觸發），需要較高頻率才有即時性，排每 30 分鐘一次（同樣避開其他 job 佔用的分鐘格）。

另外新增 `app/api/admin/transit-accessibility-sync/route.ts`，比照 `app/api/admin/aqi-sync/route.ts` 用 `requireAdminSecret` 保護，供手動觸發/驗證。

---

## 5. API 調整

`GET /api/accessible-transit`（`app/api/accessible-transit/route.ts` + `lib/server/transit/queries.ts` 的 `getTransitAccessibilityOverview`）回應新增三個欄位，其餘既有欄位不變（向後相容）：

```json
{
  "ok": true,
  "routes": [...],
  "facilities": [...],
  "hotlines": [...],
  "alerts": [ { "alertId", "railSystem", "stationName", "facilityName", "reason", "startTime", "endTime" } ],
  "stationMaps": [ { "stationName", "railSystem", "floorLevel", "mapName", "mapUrl" } ],
  "transfers": [ { "stationName", "railSystem", "exitName", "transferMode", "transferDescription" } ],
  "summary": { ...既有欄位, "activeAlertCount": number },
  "counties": [...],
  "systemTypes": [...]
}
```

`alerts`/`stationMaps`/`transfers` 支援既有的 `county`/`systemType`/`query` 篩選參數（沿用現有 filter 邏輯）。

---

## 6. UI/UX（`components/Tools/AccessibleTransitContent.tsx`）

1. 新增「設施停用公告」區塊：橫幅/清單呈現有效期間內的停用公告（可用紅/橙提示色，比照既有 `inundation-map` 的警示燈號設計語言），依目前時間自動篩掉已過期的公告。
2. 車站卡片內新增「導覽圖」小連結（有資料才顯示），點擊開新分頁看 `mapUrl` 圖片。
3. 車站卡片內新增「周邊轉乘」摘要（若有轉乘資料），列出轉乘方式與簡短說明。
4. 既有的 `features` 標籤渲染邏輯需同步 §3.1 的 `features_json.tags` 調整（避免把整個物件當字串陣列渲染而壞掉）。

不需要新建路由，沿用現有 `/tools/accessible-transit` 頁面與既有 SEO/FAQ 內容（內容若因真實資料上線而需要微調措辭，一併處理）。

---

## 7. 測試與驗收

- 既有 `tests/ncdr-and-tdx.test.mjs` 若有涵蓋 TDX 相關 mock，檢查是否需要新增本次 API 的 mock 測試。
- 本地無 TDX 真實連線時（CI 環境可能沒有外部網路），sync 函式要能在 API 失敗/逾時時優雅跳過並記錄 `errors[]`，不讓整個排程 crash（比照 `youbike/runSync.ts` 的 try/catch-per-city 寫法）。
- 部署後務必實際打一次 `GET /api/accessible-transit` 確認 `facilities`/`alerts`/`stationMaps`/`transfers` 真的有資料（而非空陣列），並確認頁面渲染正常 —— 參考過去教訓：有 query 改動沒做上線後即時驗證，曾造成生產事故（`stationWeather` 全站回 null 的案例）。
