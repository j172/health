# Spec & Ticket: 修正設施跨縣市座標錯配與強化縣市邊界防護 (Fix Facility Cross-County Coordinate Mismatch)

- **Ticket ID**: `SPEC-HEALTH-20260911-FACILITY-COORDINATE-MISMATCH`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Closes**: #196
- **Affects**:
  - `lib/server/facilities/countyBounds.ts`
  - `lib/server/facilities/addressNormalize.ts`
  - `lib/server/facilities/geocodeBatch.ts`
  - `lib/server/facilities/autoGeocode.ts`
  - `lib/server/facilities/sources/hakkaCommunity.ts`
  - `lib/server/db/mysql.ts`
  - `scripts/test-geocode-batch.mjs`

---

## 1. Problem Statement (問題陳述與根本原因)

使用者在 `/tools/hakka-bogong`（客家委員會「伯公照護站」查詢）地圖模式檢視時，發現部分外縣市站點被標示於台北市：

1. **臺中市東勢區詒福社區發展協會** (`臺中市東勢區詒福里詒福街65號`) -> 經緯度誤配至 `25.0573336, 121.5662185`（台北市松山區新東街）。
2. **花蓮縣花蓮市碧雲莊社區發展協會** (`花蓮市介禮街46號`) -> 經緯度誤配至 `25.0575339, 121.5286943`（台北市中山區中原街）。
3. **社團法人臺中市東勢農民老人會** (`臺中市東勢區新盛里新盛街527號`) -> 經緯度誤配至 `25.0595359, 121.5288460`（台北市中山區中原街）。
4. **臺南市南區文南社區發展協會** (`臺南市南區建南路154號3樓`) -> 經緯度誤配至 `25.0400089, 121.5093581`（台北市中正區延平南路）。

### 根本原因深度分析

1. **外層地理編碼服務回退過度寬鬆**：
   - OpenStreetMap Nominatim 或 OpenCage 查詢非直轄市或較冷門路名時，若門牌號碼在 OSM 資料庫不存在，會執行 token fuzzy search。由於查詢後綴包含 `, 台灣`，加上縣市前綴或村里混淆，Nominatim 將關鍵字降級匹配至台北市具類似名稱之餐廳、古蹟或教會。
2. **缺乏縣市邊界防護網 (County Bounding Box Gate)**：
   - `geocodeBatch.ts` 與 `geocodeProviders.ts` 原先僅檢查 `isWithinTaiwanBounds(lat, lng)`（涵蓋全台大範圍 `21.4`~`26.4`N, `118.0`~`122.3`E）。
   - 儘管地址明確包含「臺中市」、「臺南市」或「花蓮」，只要結果落在台灣境內，即判定為 `ok` 並寫入 `facilities` 資料表，未能阻擋跨縣市誤配。
3. **門牌正規化未處理村里與鄰**：
   - 原始開放資料常包含「詒福里」、「新盛里」、「國興里17鄰」等行政區劃資訊。
   - `cleanAddress` 原僅移除括號與樓層，未去除村里名稱，致使「詒福里詒福街」無法被地圖圖資識別為路名，直接導致路級比對失效。
4. **縣轄市別名對照缺失**：
   - `countyBounds.ts` 的 `BOUNDS` 表僅登記「花蓮縣」，地址以縣轄市「花蓮市」開頭時，`countyForAddress` 回傳 `null`，失去縣市邊界保護機制。
5. **開放資料來源欄位遺漏縣市前綴**：
   - 客委會原始 JSON 中 `city_name` 為「花蓮縣」，但 `Address` 欄位僅記載「花蓮市國興里...」，匯入時未自動將 `city_name` 補上。

---

## 2. Solution Architecture (架構與修復設計)

### 2.1 增強縣市別名對照 (`lib/server/facilities/countyBounds.ts`)
- 新增 `COUNTY_SEATS` 映射表，將 13 處縣轄市（如 `花蓮市` -> `花蓮縣`、`宜蘭市` -> `宜蘭縣`、`彰化市` -> `彰化縣` 等）對應至所屬縣份。
- 升級 `countyForAddress`：
  - 支援過濾前導數字、郵遞區號（如 `[423]`、`970`）及全形空格。
  - 支援前 12 字元寬鬆包含判定，確保即使前綴含有其他前綴詞亦能精確識別所屬縣市。

### 2.2 行政區村里與鄰智慧剝離 (`lib/server/facilities/addressNormalize.ts`)
- 實作 `stripVillageNeighborhood(rawAddress)`：
  - 精準去除緊隨在 `[區鄉鎮市]` 後之 `[里村]` 與 `\d+鄰`，同時嚴格保留縣市區鄉鎮主體。
- 擴充 `buildQueryCandidates(rawAddress)`：
  - 生成第一組原始標準化候選字串後，自動生成去除村里鄰之「道路級純淨字串」並串入候選佇列，確保地圖圖資引擎能直接命中正統道路。

### 2.3 嚴格縣市邊界防護門禁 (`lib/server/facilities/geocodeBatch.ts`, `autoGeocode.ts`)
- 在 `geocodeOneAddress` 與 `resolveRoadLevelFallback` 中傳入 `expectedCounty`。
- 在接受任何地理編碼器（TGOS、OpenCage、Nominatim）回傳之座標前，必須強制檢驗 `isWithinCountyBounds(expectedCounty, lat, lng)`。
- 若經緯度跨出所屬縣市範圍，立即拋棄並繼續嘗試下一個候選字串或將座標設為 `null`，堅決不讓任何錯誤座標污染資料庫。

### 2.4 開放資料來源補齊 (`lib/server/facilities/sources/hakkaCommunity.ts`)
- 匯入 Hakka Community 開放資料時，檢驗 `r.Address` 是否已包含 `r.city_name`，若未包含則自動補全（如「花蓮市...」補為「花蓮縣花蓮市...」）。

### 2.5 冪等資料庫座標校正 (`lib/server/db/mysql.ts`)
- 於 `ensureSchema()` 中加入自動校正遷移指令：
  - `臺中市東勢區詒福社區發展協會` -> 校正為 `lat = 24.22735, lng = 120.83594`
  - `花蓮縣花蓮市碧雲莊社區發展協會` -> 校正為 `lat = 23.98580, lng = 121.57275`
  - `社團法人臺中市東勢農民老人會` -> 校正為 `lat = 24.23747, lng = 120.83410`
  - `臺南市南區文南社區發展協會` -> 校正為 `lat = 22.98504, lng = 120.18977`
  - 同步清空任何非雙北卻誤植於台北市經緯度邊界內的歷史異常 `hakka_community` 紀錄。

---

## 3. Verification & Test Plan (驗證計畫)

1. **單元測試套件**：
   - `node scripts/test-geocode-batch.mjs`：36/36 測試通過（涵蓋村里剝離、縣轄市對照、跨縣市座標判定攔截）。
   - `npm test`：162/162 整合回歸測試全數通過。
2. **靜態型別檢查**：
   - `npx tsc --noEmit`：0 errors。
3. **線上與地圖驗證**：
   - 部署後確認 `/tools/hakka-bogong` 該 4 處站點在互動地圖上正確釘選於臺中東勢、花蓮市及臺南南區，完全脫離台北市。
