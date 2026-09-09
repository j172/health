# Specification: 防災地圖（避難收容處所／消防救援單位／應變中心）

## 0. 背景與範圍

新增獨立功能「防災地圖」（issue #168），對象是內政部（MOI）開放資料平台提供的 3 個防救災資料集。與現有「便民服務」「公共設施」是不同的分類與資料管線，也與後續規劃的文化資產（古蹟／考古遺址）地圖是兩個獨立功能——本規格只涵蓋防災地圖。

明確**捨棄**文化部 EMIC `Shelter.xml`：涵蓋範圍過小且資料過時，是 MOI 全國資料集的劣化子集，不予採用。

## 1. 資料來源

三個 CSV 皆為 UTF-8（含 BOM），已內建可用經緯度，**不需要 geocoding**。

| 資料集 | 下載 URL | 筆數（2026-09-09 curl 查驗） | 座標欄位 |
|---|---|---|---|
| 消防救援單位點位 | `.../dataset/57F3DD1D-A40E-49A6-8410-57303B2FF87E/resource/C38B7AC2-E7F3-4DD5-A3F3-88E623B55924/download` | 770 | `X座標_TWD97TM121`/`Y座標_TWD97TM121`（欄名誤標，實際值即十進位經度/緯度，例如 121.75,24.75，免轉換） |
| 應變中心點位 | `.../dataset/57F3DD1D-A40E-49A6-8410-57303B2FF87E/resource/A570EB3B-AF83-41F2-9E38-D114B0AB1F32/download` | 25（每縣市一筆） | 經度/緯度 |
| 避難收容處所點位檔案 v9 | `.../dataset/ED6CF735-6C03-4573-A882-72C1BEC799CB/resource/54550E2F-4567-4C8F-BD2E-E54E9D0386B8/download` | 5,973 | 經度/緯度 |

避難收容處所的「適用災害類別」欄位值可能是 `"水災,震災,土石流"` 這種被引號包住、內部含逗號的 CSV 欄位（curl 驗證時實測確認存在），一律用 `lib/server/facilities/csv.ts` 匯出的 `parseCsv`（正規 CSV 解析、支援引號跳脫）解析，不手刻 `split(',')`。

## 2. 資料模型

新增 1 張獨立表 `disaster_response_points`，用 `layer` enum 區分三種點位，不進 `facilities` 主表、不觸發 `lib/server/facilities/*` 的 geocode 批次管線（避免與現有 22 個來源共用的 OpenCage/Nominatim 每日額度衝突）：

```sql
disaster_response_points (
  id            INT PK AUTO_INCREMENT
  layer         ENUM('shelter','rescue_unit','eoc_center')
  name          VARCHAR(255)          -- 避難收容處所名稱 / 消防隊名稱 / 應變中心名稱
  county        VARCHAR(50)
  district      VARCHAR(50) NULL
  village       VARCHAR(50) NULL      -- 僅 shelter 有村里
  address       VARCHAR(255) NULL     -- 部分 shelter 記錄地址為空，屬資料源原始缺漏，不補值
  phone         VARCHAR(100) NULL
  longitude     DECIMAL(10,7)
  latitude      DECIMAL(10,7)
  capacity      INT NULL              -- 預計收容人數，僅 shelter
  disaster_types VARCHAR(255) NULL    -- 適用災害類別，僅 shelter，逗號分隔原始字串
  indoor        BOOLEAN NULL          -- 僅 shelter
  outdoor       BOOLEAN NULL          -- 僅 shelter
  weak_suitable BOOLEAN NULL          -- 適合避難弱者安置，僅 shelter
  manager_name  VARCHAR(100) NULL     -- 僅 shelter
  manager_phone VARCHAR(100) NULL     -- 僅 shelter
  source_updated_at DATETIME NULL     -- sync 執行時間戳，作為前端「資料更新時間」顯示依據
  created_at    DATETIME
  updated_at    DATETIME
)
```

DDL 定義於 `lib/server/db/schema.ts`（`TABLE_DDL.disasterResponsePoints`），註冊於 `lib/server/db/mysql.ts` 的 `ensureSchema()`。

## 3. 同步管線

- `lib/server/disaster/ingestDisasterPoints.ts`：三個函式 `syncRescueUnits` / `syncEocCenters` / `syncShelters`，各自：
  1. 用 `httpGetText` 下載來源 CSV，`parseCsv` 解析。
  2. 在單一 transaction 內對該 `layer` 執行 `DELETE FROM disaster_response_points WHERE layer = ?` 後批次 `INSERT`（整批覆蓋，而非累加式 upsert）——來源沒有可跨批次比對的穩定唯一鍵，累加型 upsert 會有孤兒列殘留的風險。
  3. 回傳的 `inserted` 一律是同一 transaction 內對該 layer 的 `COUNT(*)` 查詢結果，**不是**批次陣列的長度——直接複用陣列長度曾在這個專案造成「ingestion counters 說謊」的真實事故（inserted_count 回報 1374、實際只有 41 筆），這次刻意在寫入後回讀真實筆數，讓 `inserted` 永遠對應資料庫實際筆數。
  4. 回傳 `{ inserted, layer, sourceUpdatedAt }`。
- `lib/server/disaster/queries.ts`：`getDisasterMapData()`，讀出全部三層點位供前端地圖使用，並計算最新的 `source_updated_at` 作為頁面「資料更新時間」。
- `app/api/admin/disaster-sync/route.ts`：admin API，`?type=shelters|rescue_units|eoc_centers|all`（預設 `all`）分流呼叫上述三個 sync 函式，沿用 `requireAdminSecret`（比照 `app/api/admin/culture-sync/route.ts` 的寫法）。
- `app/api/disaster-map/route.ts`：公開唯讀 API，回傳 `{ ok, points, updatedAt }` 供前端地圖頁面 fetch。
- `.github/workflows/disaster-points-sync.yml`：每日一次 cron（04:20 UTC / 12:20 台北時間，落在部署安全窗口內，見 `docs/specs/`／memory 的 ingestion 部署時間規則），透過 `scripts/gha-disaster-points-sync.mjs` 以 SSH loopback 方式呼叫 `/api/admin/disaster-sync?type=all`（HawkHost 關閉 TCP forwarding，沿用 `scripts/gha-facilities-geocode-batch.mjs` 的既有 transport）。三個來源的 CSV 下載本身發生在 App Server 內（`ingestDisasterPoints.ts`），不是在 GitHub Runner 上。

## 4. 前端

- 新頁面 `/tools/disaster-map`（`app/tools/disaster-map/page.tsx`）：單頁地圖，不比照 `FacilitySearchLayout` 清單型查詢頁。
  - `components/DisasterMap/DisasterMapContent.tsx`：頁首（標題／說明／資料更新時間／免責聲明）、三個圖層 checkbox（避難收容處所預設開，消防救援單位、應變中心預設關），fetch `/api/disaster-map` 一次取得全部點位、依可見圖層在前端過濾後傳給地圖元件。
  - `components/DisasterMap/DisasterMapLeaflet.tsx`：Leaflet + OpenStreetMap（沿用專案既有 `components/Facilities/FacilityMap.tsx` 的 CDN icon-fix 手法），三個圖層各自不同顏色圓點 marker，點擊顯示 popup：名稱／地址／電話，shelter 額外顯示預計收容人數／適用災害類別／室內外／是否適合弱者安置。以 `dynamic(..., { ssr: false })` 載入（Leaflet 非 SSR 安全）。
- **頁首固定顯示**：「資料更新時間：{source_updated_at}」＋固定免責聲明文案：
  > 本頁資料非即時，僅供平時查詢參考；災害發生時之避難收容所開設狀態，請以地方政府（消防局／區公所）正式公告為準。
- `lib/server/tools/catalog.ts`：新增 `ToolGroup` 值 `"disaster-preparedness"`（與 `"public-facility"` 區隔），新增 entry `slug: "disaster-map"`。
- `app/tools/page.tsx`：`ICON_MAP` 補 `"disaster-map"`，`CATEGORIES` 新增一個 `groups: ["disaster-preparedness"]` 分類卡片，避免新分類淪為「其他工具」桶。
- `components/News/SiteNav.tsx` / `SiteFooter.tsx`：新增「防災地圖」連結（獨立單一連結，而非新開一個下拉選單分類——目前分類下只有這一個工具）。
- i18n：`locales/zh-TW.json` / `locales/en.json` 補 `nav.disasterMap`（+ `en.json` 的 `catalog["disaster-map"]` 英文標題，供 `SiteNav`/`SiteFooter` 在英文語系下顯示）。
  - 註：本專案目前僅維護 `zh-TW.json` 與 `en.json` 兩份靜態字典（`app/context/LanguageContext.tsx` 的 `SUPPORTED_LOCALES` 只有 `zh-TW`/`en`），簡體中文（zh-CN）並非獨立的靜態字典，而是既有的 `LocalizedText`/`tDynamic` 機制對**動態**（資料庫來源）字串做轉換，不適用於本頁這類靜態 UI 字串；因此本次僅比照既有慣例新增到 `zh-TW.json`/`en.json` 兩份既有字典。

## 5. Out of Scope（本次不做）

- 即時開設狀態串接
- BOCH 文化資產地圖（古蹟／考古遺址）——另立規格，待本功能上線後排入
- 整合進 `facilities` 主表或 geocode 管線

## 6. 驗收標準

- `npx tsc --noEmit` 0 errors
- `npm run lint` 0 errors
- `npm run build` 成功
- 手動用 curl 驗證三個來源目前還能正常下載、筆數跟本規格記錄的同數量級（770 / 25 / 5,973，2026-09-09 已驗證）
- `/tools/disaster-map` 三圖層可切換、popup 資訊正確、頁首更新時間與免責聲明可見
