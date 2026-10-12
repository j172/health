# Spec B：TDX「樂齡/敬老」觀光無障礙 + 敬老卡補助，新增 /tools/senior-friendly

- **作者**：Claude (orchestrator)
- **日期**：2026-10-10
- **狀態**：Approved，待開 issue 與 worktree 實作
- **關聯 Issue**：TBD（本 spec 定稿後開立）
- **前置討論**：/grill session（與 Spec A 同一場）；Spec A（TDX Senior/Rail 升級 accessible-transit，issue #434 / PR #435）已 merge + deploy

---

## 1. 背景與目標

Spec A 已處理 TDX「Senior（樂齡/敬老）」資料分類下的 `Rail` 子分類。同一分類底下還有兩塊完全不同主題、但都還沒有對應工具涵蓋的資料：

1. **Tourism（觀光景區）**：景區無障礙設施、軟性服務（輪椅借用、老花眼鏡借用、語音導覽）、樂齡套票、設施停用公告。
2. **SeniorCard（敬老卡優惠）**：22 縣市敬老卡（資格：設籍該市且年滿 65 歲以上；55 歲以上原住民）之交通補助類型與說明連結。

使用者決議：這兩塊**合併成一個新頁面** `/tools/senior-friendly`（敬老/樂齡），上半部敬老卡查詢（選縣市），下半部觀光景區無障礙設施/服務/樂齡套票。分類歸入 `life-services`（公益與生活服務），與 `elder-welfare`、`accessible-transit`、`ltc-contracted` 互相導流。

這是全新工具（不像 Spec A 是升級既有頁面），需要新建 DB 表、API route、UI 元件與 `lib/server/tools/catalog.ts` 條目。

---

## 2. TDX API 規格（使用者貼出 swagger 內容確認）

**⚠️ 已知風險（承接 Spec A 的未解問題）**：Spec A 實作時，10+ 種 base path 組合（`/api/advanced/v1/Senior/Rail/...`、`/api/basic/v2/Senior/...` 等）全部回 404，真正的 Senior 分類 base path 至今未確認（見 `lib/server/transit/tdxSeniorClient.ts` 裡 `SENIOR_RAIL_BASE` 的詳細記錄）。Tourism/SeniorCard 很可能共用同一個未知的 base path（同屬 `Senior` 分類），**實作前第一步應該去查這個 base path 是否已經確認**（問使用者、查 `docs/archive/specs/tdx-senior-rail-accessibility-upgrade.md` 的最新狀態，或自己重新嘗試）。若仍未解，程式要跟 Spec A 一樣優雅降級（sync 失敗記錄到 `errors[]`，不 crash，頁面顯示 fallback seed 資料），不要被這個卡住而不交付。

### 2.1 Tourism（觀光景區，4 個 API，無路徑參數，查詢全臺）

| API | 路徑 | 說明 |
|---|---|---|
| 設施 | `GET /V1/Senior/Tourism/Facility` | 景點無障礙設施：廁所、充電站、服務中心等，含座標、樓層 |
| 服務 | `GET /V1/Senior/Tourism/Service` | 軟性服務：行動旅服、輪椅/老花眼鏡/手杖借用、語音導覽等 |
| 樂齡套票 | `GET /V1/Senior/Tourism/SeniorTourPackage` | 樂齡套票名稱、介紹、購票網址、圖片、發行單位 |
| 停用公告 | `GET /V1/Senior/Tourism/Facility/Alert` | 景區設施/步道停用公告，含起訖時間 |

欄位（Example Value，實作時以實際回應為準）：

```ts
// Facility
{ UpdateTime, UpdateInterval, AttractionID, AttractionName, CityCode,
  Toilets: FacilityItem[], ChargingServices: FacilityItem[], InformationCenters: FacilityItem[] /* 其餘類別依實際回應新增，用跟 Spec A 一樣的 flattenFacilityCategories() 動態處理 */ }
interface FacilityItem { FacilityID, FacilityName, BuildingName, PositionLon, PositionLat, FloorLevel, Description }

// Service
{ AttractionID, AttractionName, ServiceName, Description, ServiceURL, ServicePhone, CityCode, UpdateTime, UpdateInterval }

// SeniorTourPackage
{ UpdateTime, UpdateInterval, PackageName, Description, BookingURL, PictureURL, IssuingEntity }

// Facility/Alert
{ UpdateTime, UpdateInterval, AlertID, Reason, Type, ID, Name, StartTime, EndTime, PublishTime }
```

`CityCode` 用的是縣市英文代碼（如 `NAN`=南投縣），比對 `lib/server/youbike/tdxClient.ts` 的 `TDX_CITIES` 表或專案既有的縣市代碼對照（找一下 repo 裡其他地方是否已有 TDX CityCode → 中文縣市名的共用對照表可重用，避免重複定義）。

### 2.2 SeniorCard（敬老卡優惠，1 個 API，依 22 縣市路徑參數）

| API | 路徑 | 說明 |
|---|---|---|
| 敬老卡 | `GET /V1/Senior/SeniorCard/City/{City}` | 縣市敬老卡補助類型、說明網址 |

`City` 路徑參數列舉：`TPE,NWT,TAO,TXG,TNN,KHH,KEE,HSZ,HSQ,MIA,CHA,NAN,YUN,CYQ,CYI,PIF,ILA,HUA,TTT,KIN,PEN,LIE`（22 縣市，與專案現有 22 縣市列舉順序對照即可，注意這組代碼跟 §2.1 的 `CityCode`、跟 YouBike 的 `TDX_CITIES` 三套代碼可能互不相同，逐一核對不要假設一致）。

欄位：

```ts
{ UpdateTime, UpdateInterval, AutorityName, SeniorCardName, URL,
  Subsidies: Array<{ Category: string; Description: string }> }
```

---

## 3. 資料庫設計（全新表，4 張）

```sql
CREATE TABLE IF NOT EXISTS senior_tourism_facilities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attraction_id VARCHAR(64) NOT NULL,
  attraction_name VARCHAR(128) NOT NULL,
  city_code VARCHAR(16) NULL,
  county VARCHAR(32) NULL,
  facility_category VARCHAR(64) NOT NULL,
  facility_name VARCHAR(128) NULL,
  building_name VARCHAR(128) NULL,
  floor_level VARCHAR(32) NULL,
  description TEXT NULL,
  lat DECIMAL(10, 7) NULL,
  lng DECIMAL(10, 7) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_attraction (attraction_id),
  INDEX idx_county (county)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS senior_tourism_services (
  id INT AUTO_INCREMENT PRIMARY KEY,
  attraction_id VARCHAR(64) NOT NULL,
  attraction_name VARCHAR(128) NOT NULL,
  county VARCHAR(32) NULL,
  service_name VARCHAR(128) NULL,
  description TEXT NULL,
  service_url VARCHAR(512) NULL,
  service_phone VARCHAR(64) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_attraction (attraction_id),
  INDEX idx_county (county)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PackageName 不保證全域唯一，用 AUTO_INCREMENT；sync 採「每次整批 DELETE+INSERT」
-- 而非 upsert（資料量小、無天然 key，比照 Spec A 的 maps/transfers 寫法）。
CREATE TABLE IF NOT EXISTS senior_tour_packages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  package_name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  booking_url VARCHAR(512) NULL,
  picture_url VARCHAR(512) NULL,
  issuing_entity VARCHAR(128) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS senior_tourism_alerts (
  alert_id VARCHAR(64) PRIMARY KEY,
  type VARCHAR(32) NULL,
  target_id VARCHAR(64) NULL,
  target_name VARCHAR(128) NULL,
  reason TEXT NULL,
  start_time DATETIME NULL,
  end_time DATETIME NULL,
  publish_time DATETIME NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 一縣市可有多筆補助類型 (Subsidies 陣列展開成多列)，故用 AUTO_INCREMENT +
-- (county, category) 索引，而非把 Subsidies 整包塞 JSON —— 方便依類型篩選。
CREATE TABLE IF NOT EXISTS senior_card_subsidies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  county VARCHAR(32) NOT NULL,
  card_name VARCHAR(64) NULL,
  info_url VARCHAR(512) NULL,
  category VARCHAR(64) NULL,
  description TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_county (county)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

加進 `lib/server/db/schema.ts` 的 `TABLE_DDL` 與 `lib/server/db/mysql.ts` 的 `runSchemaMigrations()`，照 Spec A（PR #435）剛加過的 3 張表的慣例做（同一批 `await p.query(TABLE_DDL.xxx)`）。

**種子資料（fallback seed）**：比照 `lib/server/transit/data/transitSeed.ts` 的模式，為這 5 張表（或至少 `senior_card_subsidies`，這是使用者最常查的）準備一份精簡 seed data，在表為空時顯示，避免 TDX base path 問題（見 §2 開頭警示）導致頁面上線時完全空白。22 縣市敬老卡至少每縣市 1-2 筆基本資訊（可從各縣市社會局公開資訊或新聞稿取材，不用每筆都精確，重點是頁面不開天窗）。

---

## 4. 同步作業設計

新增 `lib/server/seniorTourism/tdxClient.ts`（沿用 `lib/server/tdx/auth.ts` 的 `getTdxToken()` 共用 helper，**不要**再重新寫一份 OAuth2 token 邏輯）與 `lib/server/seniorTourism/runSync.ts`：

1. `runSeniorTourismSync()`：呼叫 Tourism 4 個 API（皆無路徑參數，各呼叫一次即可，不像 Rail 需要迴圈 10 種系統），upsert/replace 進 §3 前 4 張表。
2. `runSeniorCardSync()`：迴圈 22 縣市呼叫 SeniorCard API，展開 `Subsidies[]` 寫入 `senior_card_subsidies`（先 `DELETE WHERE county=?` 再整批 INSERT，比照 Spec A maps/transfers 的 replace 寫法，因為 Subsidies 沒有天然唯一 key）。

排程註冊（`lib/server/cron/registerJobs.ts`，比照 Spec A 剛加的兩個 job 挑選未被佔用的分鐘）：
- Tourism 4 個 API 的 `UpdateInterval` 多為 86400（除了 Alert 是 -1），所以可以學 Spec A 拆兩個 job：Facility/Service/Package 每日一次，Facility/Alert 每 30 分鐘一次。
- SeniorCard 每日一次即可（補助政策不會頻繁變動）。

新增 `app/api/admin/senior-tourism-sync/route.ts`，比照 `app/api/admin/transit-accessibility-sync/route.ts` 用 `requireAdminSecret` 保護，手動觸發三個 sync 函式。

每個 TDX 呼叫、每個縣市迴圈都要獨立 try/catch 記錄進 `errors[]`，絕不整個拋出中斷—— 比照 Spec A 的 `syncRailSystem()` 寫法。

---

## 5. API 規範

新增 `GET /api/senior-friendly`：

```json
{
  "ok": true,
  "seniorCards": [ { "county", "cardName", "infoUrl", "subsidies": [{ "category", "description" }] } ],
  "tourismFacilities": [ { "attractionName", "county", "category", "facilityName", "description", "lat", "lng" } ],
  "tourismServices": [ { "attractionName", "county", "serviceName", "description", "serviceUrl", "servicePhone" } ],
  "tourPackages": [ { "packageName", "description", "bookingUrl", "pictureUrl", "issuingEntity" } ],
  "tourismAlerts": [ { "alertId", "type", "targetName", "reason", "startTime", "endTime" } ],
  "counties": [ "臺北市", ... 22 縣市 ],
  "updatedAt": "ISO timestamp"
}
```

支援 `county`（篩縣市）、`query`（關鍵字搜尋景點/服務名稱）兩個 query params，邏輯比照 `lib/server/transit/queries.ts` 的既有 filter 寫法（`WHERE 1=1` + 動態 AND）。

查詢函式放在新建的 `lib/server/seniorTourism/queries.ts`，`getSeniorFriendlyOverview(filter)`，內部呼叫一個 `ensureSeniorFriendlySeeded()`（比照 `ensureTransitSeeded()` 的「表為空才灌 seed」模式）。

---

## 6. UI/UX（全新頁面）

新增路由 `app/tools/senior-friendly/page.tsx` + `components/Tools/SeniorFriendlyContent.tsx`（可直接參考 `AccessibleTransitContent.tsx` 的整體結構：縣市下拉篩選、搜尋框、卡片清單、深色模式樣式 class 慣例）。

版面（上到下）：

1. **敬老卡查詢**：縣市下拉選單（預設「全部」），選定後顯示該縣市 `senior_card_subsidies` 的補助類型清單（卡片式），每筆附 `infoUrl` 外部連結按鈕。
2. **觀光景區無障礙設施/服務**：搜尋框（比對景點名稱），結果卡片列出該景點的無障礙設施標籤（比照 Spec A 的 `features` tag 渲染邏輯）與軟性服務（含電話一鍵撥號，比照 `AccessibleTransitContent.tsx` 既有的撥號複製邏輯）。
3. **樂齡套票推薦**：橫向捲動或網格卡片，顯示套票名稱、說明、發行單位、「前往購票」外部連結按鈕（`BookingURL`）。
4. **景區設施停用公告**：比照 Spec A 剛做的橙色警示橫幅元件風格（有效期間內才顯示，前端用 `useState(() => Date.now())` lazy init 避免 render 期間呼叫 impure function，這是本 repo 的既有慣例，見 `AccessibleTransitContent.tsx`）。

頁面需要的 SEO/結構化資料比照 `ToolPageShell`（查一下既有 `/tools/accessible-transit/page.tsx` 怎麼包的，照抄模式），並在 `lib/server/tools/catalog.ts` 新增一筆：

```ts
{
  slug: "senior-friendly",
  group: "life-services",
  title: "...", // 參考既有條目語氣寫一個 SEO 標題，例如「敬老卡補助與樂齡旅遊地圖：全臺22縣市敬老卡交通補助查詢」
  description: "...",
  directAnswer: "...",
  scientificBasis: [...], // 參考 elder-welfare 條目的寫法，標註交通部TDX、各縣市社會局為資料來源
  relatedSlugs: ["elder-welfare", "accessible-transit", "ltc-contracted"],
  faqs: [...],
  schemaType: "WebPage", // 這是行政補助/開放資料工具，不是醫療內容，比照 issue #136 的既有規則（見 catalog.ts 該欄位註解）
}
```

同時到 `accessible-transit` 與 `elder-welfare` 兩筆既有條目的 `relatedSlugs` 加上 `"senior-friendly"`，做雙向導流（檢查這兩筆目前的 `relatedSlugs` 內容，用 `replace_all` 之類精準編輯，不要整段重寫）。

`locales/zh-TW.json`（與其他語言檔，若既有慣例要求同步翻譯 key）可能需要加 nav 相關文案，檢查 `/tools` 導覽選單怎麼從 `TOOL_CATALOG` 自動生成（`SiteNav.tsx`/`SiteFooter.tsx`），通常不需要手動加選單項目，只要 catalog 條目的 `group` 對了就會自動出現。

---

## 7. 測試與驗收

- 新增 `tests/senior-friendly.test.mjs`（或視專案慣例併入既有相關 test 檔），比照 Spec A `tests/ncdr-and-tdx.test.mjs` 新增測項的風格（對原始碼內容做斷言，這是本 repo 既有的測試慣例，非真的 HTTP mock）。
- `npm run typecheck`、`npm run lint`、`npm test` 全過。
- 部署後務必實際打一次 `GET /api/senior-friendly` 確認回應結構正確，並打開 `/tools/senior-friendly` 頁面確認渲染（即便 TDX 真實資料因 base path 問題還抓不到，起碼 fallback seed 要正常顯示，不能整頁空白或 500）。
