# Specification: 兒少福利擴充與便民服務（原公共設施更名）全端規格

## 1. 概述 (Overview)
本規格定義全站「公共設施」更名為「便民服務（Public Services）」之後續架構調整，並於「兒少福利」與「便民服務」兩大分類新增 7 大官方開放資料集之匯入、座標補齊與前端互動工具頁面。

---

## 2. 導覽與 Taxonomy 架構變更

### 2.1 分類與語系鍵值對照
- **原分類**：`publicFacilities`（公共設施）
- **新分類**：`publicServices`（便民服務）
- **i18n 多國語系**：
  - `zh-TW`: `nav.publicServices` = "便民服務"
  - `zh-CN`: `nav.publicServices` = "便民服务"
  - `en`: `nav.publicServices` = "Public Services"

### 2.2 兒少福利 (Child & Youth Welfare) 收錄工具清單
1. `/tools/child-welfare-centers`：**兒少福利中心查詢** (衛福部社會及家庭署)
2. `/tools/child-welfare-nurseries`：**全國親子館查詢** (衛福部社會及家庭署)
3. `/tools/kindergartens` [NEW]：**全國幼兒園查詢** (教育部 `k1_new.json`)
4. `/tools/cram-schools` [NEW]：**全國短期補習班查詢** (教育部 22 縣市 `afterschool_json.jsp` 合併)
5. `/tools/child-safety-spots` [NEW]：**婦幼安全警示地點查詢** (警政署開放資料)
6. `/tools/family-cultural-activities` [NEW]：**全國親子藝文活動查詢** (文化部 category=4)

### 2.3 便民服務 (Public Services) 收錄工具清單
1. `/tools/public-toilets`：**全國公廁查詢** (環境部)
2. `/tools/green-shops`：**綠色商店查詢** (環境部)
3. `/tools/disability-atm`：**無障礙ATM查詢** (信合社聯合社)
4. `/tools/tax-organizations` [NEW]：**機關團體與扣繳單位查詢** (財政部 `BGMOPEN99.csv`)
5. `/tools/travel-epidemic-alerts` [NEW]：**國際旅遊疫情與即時情報地圖** (疾管署 `TCDCTravelAlert.csv` + `TCDCIntlEpidAll.csv`)

---

## 3. 後台匯入與 Geocoding 管線

### 3.1 匯入腳本
- `scripts/import-moe-cram-schools.mjs`：爬取並合併 22 縣市補習班 JSON（約 1.8 萬筆），提取名稱、地址、類科、立案日期，提交至 `/api/admin/facilities-import`（`facilityType: "cram_school"`）。
- `scripts/import-moe-kindergartens.mjs`：解析教育部 `k1_new.json`，提取公私立、地址、電話、核定人數，提交至 `/api/admin/facilities-import`（`facilityType: "kindergarten"`）。
- `scripts/import-npa-child-safety-spots.mjs`：解析警政署 CSV，提取地點路段、管轄分局與聯繫電話，提交至 `/api/admin/facilities-import`（`facilityType: "child_safety_spot"`）。
- `scripts/import-fia-tax-organizations.mjs`：解析財政部 `BGMOPEN99.csv`，依縣市賦予中心座標，提交至 `/api/admin/facilities-import`（`facilityType: "tax_organization"`）。
- `scripts/sync-cdc-travel-alerts.mjs`：同步疾管署國際旅遊疫情與即時快訊 CSV。

### 3.2 Geocoding 批次定位更新
在 `scripts/geocode-all-facilities.mjs` 中依優先級納入：
- `child_safety_spot`（婦幼安全警示地點）
- `kindergarten`（全國幼兒園）
- `cram_school`（短期補習班）
- `tax_organization`（機關團體扣繳單位）

---

## 4. 前端互動頁面與 API 設計

### 4.1 設施類查詢頁面 (FacilitySearchLayout 複用)
- 幼兒園 (`/tools/kindergartens`)：支援公私立類別篩選、關鍵字搜尋、地圖 Pin 點與距離排序。
- 短期補習班 (`/tools/cram-schools`)：支援類科（文理、外語、藝能等）篩選、縣市行政區過濾。
- 婦幼警示點 (`/tools/child-safety-spots`)：地圖呈現警示路段、警方專人窗口與聯繫電話。
- 機關團體 (`/tools/tax-organizations`)：支援統編 8 碼極速查詢、名稱搜尋、一鍵複製統編與稅籍公示外連。

### 4.2 動態活動與國際疫情地圖頁面
- 親子藝文活動 (`/tools/family-cultural-activities`)：
  - 後端 API: `app/api/culture/shows/route.ts`
  - 前端: 活動日曆、近期展演切換、場館地圖、票價標籤與購票外連。
- 國際旅遊疫情 (`/tools/travel-epidemic-alerts`)：
  - 後端 API: `app/api/cdc/travel-alerts/route.ts`
  - 前端: 全球警戒等級互動地圖（紅/橙/黃）、國家快搜、雙分頁【旅遊疫情建議等級 / 國際重要疫情快訊】。

---

## 5. 自動化排程與驗收標準
- `npx tsc --noEmit` 0 errors
- `npm run lint` 0 errors
- `npm run build` 成功建置所有靜態與動態路由
