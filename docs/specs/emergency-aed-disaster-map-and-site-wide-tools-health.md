# 全國公共場所 AED 急救地圖、天然災害避難地圖修復、地圖定位權限標準化與全站工具健康巡檢規格書

- **作者**：Antigravity Agent
- **日期**：2026-09-16
- **狀態**：Implemented & Verified
- **關聯 Issue**：#300

---

## 1. 背景與問題陳述

使用者回報線上正式環境 `https://health.j172.tw/tools/aed` 與 `https://health.j172.tw/tools/disaster-map` 呈現「沒有資料」，並提出兩項全站級要求：
1. **確認所有頁面都有資料**：落實零空白（Zero Empty State）容災架構，在資料庫未同步、無即時資料或離線環境下，皆具備真實種子備份資料（Seed Fallback）。
2. **所有有地圖顯示的頁面皆需定位權限標準化**：地圖掛載時主動請求定位、在未授權或降級至預設點時顯示友善指引與「🎯 重新取得定位」按鈕，並於地圖右上方統一配置懸浮式定位回正按鈕。
3. **全站工具健康巡檢**：針對 `app/tools` 下全量工具進行全面性健康盤點與修復。

---

## 2. 根本原因深度分析 (Root Causes)

### 2.1 `/tools/aed` (公共場所 AED 急救地圖)
- **原因**：遠端與本機資料庫 `facilities` 資料表中，`facility_type = 'aed'` 之資料列為 0 筆。且先前的 `app/api/facilities/route.ts` 內的 `SEED_FACILITIES` 字典未配置 `aed` 種子檔，導致呼叫 `/api/facilities?type=aed` 時回傳 `{"facilities":[], "total":0}`，前端直接落入查無資料空狀態。

### 2.2 `/tools/disaster-map` (天然災害示警與避難地圖)
- **原因**：API `/api/disaster-map` 正常回傳 5,973 個點位（JSON 大小達 2.24 MB）。然而前端 `DisasterMapLeaflet.tsx` 在無叢集（MarkerCluster）之情況下，同時將近 6,000 個 SVG DOM Marker 渲染至 Leaflet 畫布中，造成瀏覽器主執行緒嚴重凍結（DOM Freezing），頁面持續卡在「載入中…」，使用者誤以為無資料。

### 2.3 地圖定位權限體驗不一致
- 既有獨立地圖頁面（如 `breastfeeding-rooms`, `contraception-map`, `dengue-mosquito-map`, `heritage-map`, `public-art`, `cpc-stations`）雖部分引入 `useGeolocation`，但缺乏統一且清晰的使用者視覺提示，當使用者拒絕權限或瀏覽器彈窗等待時，頁面無任何回饋；且未提供一鍵重新整理定位之懸浮按鈕。

---

## 3. 解決方案與架構設計

### 3.1 AED 雙層容災與專屬急救地圖
1. **種子資料建置 (`scripts/build-aed-seed.mjs` & `data/facilities-seeds/aed.json`)**：
   - 彙整全台 22 縣市（含離島金門、澎湖、連江）共 89 處精準經緯度標記之代表性公共場所 AED（高鐵站、火車站、機場、轉運站、區公所、文化中心、體育場館）。
   - 收錄場所名稱、設置地點描述、開放時間、聯絡電話及緊急聯絡資訊。
2. **API 容災降級 (`app/api/facilities/route.ts`)**：
   - 註冊 `SEED_FACILITIES.aed`，即使資料庫 table 0 筆資料，API 亦自動無縫切換至種子備份回傳，確保 100% 零空白。
3. **專屬 Leaflet 急救地圖 (`components/Tools/AedMapLeaflet.tsx`)**：
   - 區分 24 小時開放與限時開放圖標。
   - 繪製 5km 緊急搜救半徑圈。
   - 整合直接啟動 Google 地圖緊急導航按鈕與一鍵撥打電話。
4. **自動擴大搜救半徑 (`components/Tools/AedContent.tsx`)**：
   - 若 5km 範圍內查無站點，前端自動觸發擴大半徑重新抓取全縣市/全台最近點，並提示「已為您自動擴大搜尋半徑至全台最近據點」，確保絕不呈現空畫面。

### 3.2 避難地圖效能激增與關鍵應變卡片 (`DisasterMap`)
1. **距離動態截斷 (`cappedPoints`)**：
   - 在 `DisasterMapLeaflet.tsx` 中，依據地圖中心點／GPS 即時位置計算距離，僅取出前 400 個最近點進行 SVG DOM 渲染。徹底解決 5,900+ 點 DOM 凍結問題，地圖秒開秒載。
2. **就近緊急避難所與消防隊快選卡片 (`DisasterMapContent.tsx`)**：
   - 地圖上方陳列最近 4 處「緊急收容處所」與「消防救援分隊」即時卡片，標記直線距離，支援一鍵導航與一鍵撥號。
3. **縣市快選與關鍵字複合過濾**：
   - 支援 22 縣市過濾與名稱模糊搜尋。

### 3.3 跨全站地圖定位權限標準化 (`MapLocationBanner.tsx`)
1. **三態響應設計**：
   - `awaitingPermission`：正在等待瀏覽器原生彈窗允許，顯示動態脈衝圖標與提示文字。
   - `isDefault` / 拒絕 / 逾時：明確告知目前降級至預設中心（台北101），並提供顯眼的「🎯 重新取得定位」互動按鈕。
   - `granted`：綠色提示條，顯示精準定位已生效，設施已依距離排序，並提供輕量更新連結。
2. **全站 29 款地圖全面覆蓋**：
   - 20 款基於 `FacilitySearchContent` 之工具頁面統一植入 `MapLocationBanner` 與 `FacilityMap` 懸浮定位回正按鈕。
   - 9 款獨立地圖工具頁面（`aed`, `disaster-map`, `breastfeeding-rooms`, `contraception-map`, `dengue-mosquito-map`, `heritage-map`, `cpc-stations`, `public-art`, `inundation-map`）全數完成 `MapLocationBanner` 與浮動回正按鈕整合。

---

## 4. 全站 69 款工具健康巡檢結果

透過自研自動化巡檢腳本 `scripts/site-wide-tools-health-check.mjs`，對 `app/tools` 下全部 69 個目錄進行全面性檢核：

| 分類 | 工具數量 | 代表路徑 | 地圖支援 | 定位與橫幅支援 | 容災狀態 |
|---|---|---|---|---|---|
| **醫療長照與便民設施** | 20 | `/tools/clinics`, `/tools/pharmacies`, `/tools/long-term-care` 等 | 🗺️ 20/20 | ✅ 20/20 (100%) | 🟢 健全 |
| **專屬互動式地圖** | 9 | `/tools/aed`, `/tools/disaster-map`, `/tools/cpc-stations` 等 | 🗺️ 9/9 | ✅ 9/9 (100%) | 🟢 健全 |
| **健康試算與評估** | 10 | `/tools/bmi`, `/tools/body-fat`, `/tools/blood-pressure` 等 | — | — | 🟢 健全 |
| **即時監測與環境儀表板** | 8 | `/tools/aqi`, `/tools/weather-alerts`, `/tools/water-conditions` 等 | — | — | 🟢 健全 |
| **一般開放資料查詢** | 22 | `/tools/er-status`, `/tools/youbike`, `/tools/drugs` 等 | — | — | 🟢 健全 |
| **總計** | **69** | — | **29 款** | **29 / 29 (100%)** | **🟢 全數健全** |

---

## 5. 驗證與測試計畫

### 5.1 自動化單元測試
- 指令：`npm test`
- 結果：264 個測試案例全數通過（264 pass, 0 fail）。

### 5.2 TypeScript 靜態型別檢驗
- 指令：`npm run typecheck`
- 結果：0 錯誤，完美通過。

### 5.3 巡檢驗證
- 指令：`node scripts/site-wide-tools-health-check.mjs`
- 結果：全站 69 款工具全數綠燈，29 款地圖定位標準化達成率 100%。
