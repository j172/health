# 全系統正體字標準化（「台」全面升級為教育部標準正體「臺」）規格書

- **作者**：Antigravity Agent
- **日期**：2026-09-18
- **狀態**：Implemented & Verified
- **關聯 Issue**：https://github.com/j172/health/issues/317 (#317)

---

## 1. 背景與目標

專案歷史代碼與外部資料庫在地理名稱、UI 介面文案與功能模組中存在「台」與「臺」混用情形（例如 `TAIWAN_COUNTIES` 原定義為 `["台北市", "台中市", "台南市", "台東縣", ...]`，且 `normalizeCountyName` 早期強制轉換為俗體 `replace(/臺/g, "台")`）。

使用者要求將全系統「台北」改為「臺北」，並啟動正體中文 **GRILL ME** 深度訪談。經決策樹逐層審定，達成全域標準化共識：
1. **分層安全重構**：UI 介面、常數定義與靜態種子資料全面改為正體「臺」，同時保留對外部 Open Data 與歷史 URL 查詢參數的雙向容錯相容性。
2. **全系統「台」升級為「臺」**：不僅限於臺北，臺灣全島及四大行政區（臺北、臺中、臺南、臺東）與相關衍伸機構詞彙一律升級為正體。
3. **功能名詞遵循教育部正體字規範**：平臺、服務臺、櫃檯、月臺、後臺、舞臺、尿布臺、洗手臺全面統一。
4. **URL 與 API 零破壞**：無論傳入 `台北市` 或是 `臺北市`，後端 API 透過 `normalizeCountyName` 與雙向匹配均能精準過濾，書籤零失效。
5. **資料庫與種子資料處置**：以安全清洗腳本更新 `data/` 下所有種子 JSON 檔，並獨立產出 SQL Migration 供遠端正式庫選用執行。

---

## 2. 核心架構與實作規格

### 2.1 地理字典常數與正規化升級 (`lib/constants/taiwanDistricts.ts`)
- **標準常數陣列**：
  ```ts
  export const TAIWAN_COUNTIES = [
    "臺北市", "新北市", "基隆市", "桃園市", "新竹市", "新竹縣", "苗栗縣",
    "臺中市", "彰化縣", "南投縣", "雲林縣", "嘉義市", "嘉義縣",
    "臺南市", "高雄市", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣",
    "澎湖縣", "金門縣", "連江縣",
  ] as const;
  ```
- **雙向正規化函式 (`normalizeCountyName`)**：
  - 輸入無論帶有「台」或「臺」，皆標準化輸出為官方正體「臺北市」、「臺中市」、「臺南市」、「臺東縣」。
- **舊鍵值別名兼容 (`TAIWAN_COUNTY_DISTRICTS` & `TAIWAN_COUNTY_CENTROIDS`)**：
  - 同時包含 `臺` 與 `台` 之鍵值映射，確保第三方模組或既有程式以舊鍵值索引時維持 100% 安全不拋錯。

### 2.2 API 端點與查詢參數雙向相容
- `app/api/facilities/route.ts`：縣市篩選器將查詢參數與機構地址透過 `replace(/台/g, "臺")` 進行雙向相容正規化比對。
- `app/api/breastfeeding-rooms/route.ts`：引入 `normalizeCountyName`，使 `?county=台北市` 與 `?county=臺北市` 具備相同過濾能力。
- `app/api/weather/rainfall/route.ts`：`COUNTY_COORDINATES` 同時提供 `臺北市` 與 `台北市` 座標，保障無 GPS 時縣市降級定位正常。

### 2.3 UI 元件與目錄呈現
- `components/Facilities/CountyDistrictPicker.tsx`：預設選單更新為「全臺灣 (不限縣市)」，縣市清單使用正體。
- 地圖預設位置提示統一：YouBike、AED、CPC 中油加油站、災害地圖、文資地圖等皆統一標示「臺北 101」。
- `lib/server/tools/catalog.ts`：全站 80 款工具之中繼資料、標題、說明與常見問答中的「平台」、「全台」、「台灣」、「台北」全數轉換為正體。
- `lib/server/tools/strokeOrder.ts` 與 `scripts/generate-stroke-table.mjs`：為「臺」字補足教育部標準 14 劃（至部，部首外 8 畫，總筆畫 14），維持工具依筆畫排序正確性。

### 2.4 種子資料清洗與資料庫遷移腳本
- `scripts/migrate-tai-to-tai.mjs`：自動遞迴清洗 `data/*.json` 與 `data/facilities-seeds/*.json`，排除識別碼（`id`, `url`, `link`, `hash` 等），更新名稱與地址。
- `migrations/20260918_convert_tai_to_tai.sql`：提供 `UPDATE facilities SET address = REPLACE(...)` 等冪等更新腳本。

---

## 3. 測試與驗證

1. `lib/constants/taiwanDistricts.test.mjs`：驗證 22 縣市、368 鄉鎮區與雙向正規化正確性（4 項通過）。
2. `tests/pagination-and-search.test.mjs`：驗證縣市字典與選擇器契約（5 項通過）。
3. `scripts/tgosBatchWorkflow.test.mjs`：驗證門牌清洗與 TGOS 流程相容性（7 項通過）。
4. `scripts/test-geocode-batch.mjs`：驗證 Geocode 批次工作流程與來源優先序（36 項通過）。
5. `npm test`：全套測試套件包含筆畫排序、各工具與安全防護（289 項全數通過）。
