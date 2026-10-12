# 機構地址全面輕度正規化、官方 GPS 白名單保護與智慧座標重算規格說明書

- **Ticket ID**: `SPEC-HEALTH-20260919-FACILITIES-GEO-RENORMALIZE`
- **Priority**: HIGH (P1)
- **Status**: IMPLEMENTED
- **Affects**:
  - `lib/server/facilities/addressRules.mjs`
  - `scripts/renormalize-facilities-addresses.mjs`
  - `scripts/rollback-facilities-addresses.mjs`
  - `tests/renormalize-facilities-addresses.test.mjs`
  - `package.json`

---

## 1. 背景與核心問題 (Background & Core Problems)

全站機構與生活據點主表（`facilities`）收錄超過 29 萬筆據點，是地圖呈現、空間距離計算與鄰近搜尋的核心基石。然而歷經多個資料源匯入與早期降級定位，存在以下結構性問題：

1. **原始地址髒資料干擾門牌比對**：
   - 部分開放資料存在全形數字（如 `信義路五段７號`）、括號備註（如 `(1樓)`、`（代表）`、`【舊址】`）。
   - 歷史爬蟲重複疊加縣市鄉鎮前綴（如 `新北市土城區新北市土城區中正路18號`、`臺中市中市北屯區`）。
   - 多地址並列（逗號或「及」分割）導致 Geocoder 無法識別。
2. **舊版 Geocoder 道路中心點模糊聚攏弊端**：
   - 在導入 TGOS 官方門牌比對前，舊版 OpenCage / Nominatim 因無法辨識臺灣門牌號，強制降級至「道路中心點（centroid）」。
   - 導致同條道路上不同門牌（例如 `汀州路一段384號`、`92巷28號`、`53號1樓`）全數被賦予完全相同的經緯度（`25.0347083, 121.5324580`），地圖圖釘嚴重重疊失真。
3. **不能粗暴全量覆蓋已定位據點**：
   - 全站 29 萬筆據點中，有超過 15 萬筆來自衛福部、教育部、環境部之原始開放資料自帶現場調查或官方登記的高精度 GPS 點位（如醫院、健保藥局、公廁、長照機構等）。若全量抹除重抓，不僅會擠爆外部 API 配額（需連續消耗數十天），還會使高品質官方座標發生反向精度降級。

---

## 2. GRILL ME 審定決策與架構規範 (Architectural Consensus)

依據正體中文 GRILL ME 審定程序，確立以下 6 大架構原則：

### 2.1 目標範圍 (Target Scope)
- 嚴格鎖定 `facilities` 資料表，不盲目擴及無經緯度欄位規劃之其他業務表。

### 2.2 座標重算策略：智慧重算 (Smart Targeted Re-fetch)
- **官方 GPS 白名單絕對保護**：衛福部、教育部、環境部等原始自帶座標之來源，現有經緯度永久保留，只允許正規化其文字地址。
- **推算座標與無座標者重置**：非白名單之純文字推算來源（如 9.9 萬筆稅籍組織、補習班等），其舊推算座標清空（`lat=NULL, lng=NULL, geocode_attempts=0`），交由 TGOS 重新精準定位。
- **缺漏補齊**：所有 `lat IS NULL` 者重置 `geocode_attempts = 0`。

### 2.3 官方 GPS 白名單來源清單
```js
export const OFFICIAL_GPS_SOURCES = new Set([
  // 衛福部 & 健保署
  "nhi_hospital",           // 健保醫療院所
  "nhi_pharmacy",           // 健保特約藥局
  "mohw_ltc_contracted",   // 長照特約機構
  "mohw_ltc_full",         // 長照機構
  "mohw_hpa_facility",     // 國健署促進機構
  "nhi_home_healthcare",    // 居家醫療機構
  // 教育部
  "moe_kindergarten",       // 全國幼兒園
  // 環境部
  "moenv_public_toilet",    // 全國公廁 (fac_p_07)
  "moenv_cool_spot",        // 涼適點 (gis_p_82)
  "moenv_green_restaurant", // 環保餐廳 (gis_p_11)
  "moenv_green_hotel",      // 環保標章旅館 (gp_p_43)
]);
```

### 2.4 地址正規化規範 (Normalization Rules)
採兩段式演進：
1. **第一段：輕度清洗落盤**
   - 全形數字轉半形（`０-９` $\to$ `0-9`）。
   - 全形空白轉半形，多餘空白摺疊。
   - 剝除備註括號（`[（(【\[][^）)】\]]*[）)】\]]`）。
   - 去除引號，多地址取首位。
   - 去除重複之縣市/鄉鎮市區前綴（`dedupeAddressPrefix`）。
   - 保留自然閱讀中文（「臺/台」、段、樓等不強轉，保留村里）。
2. **第二段：TGOS 官方標準門牌補強**
   - 批次比對後，將 TGOS 回傳之官方標準門牌寫入資料庫補強。

### 2.5 三階段流水線推進 (Three-Phase Execution Pipeline)
1. **Phase 1：DB 地址清洗落盤 + 開放資料免費交叉比對**
   - 執行 `renormalize-facilities-addresses.mjs` 落盤地址並重置需重算座標。
   - 執行既有 `backfill-facilities-from-opendata-geo.mjs`，以 0 配額補齊一般藥局與健檢機構。
2. **Phase 2：TGOS 批次 CSV 大通量比對**
   - 透過 `export-facilities-for-tgos.mjs` 匯出每檔 10,000 筆之 UTF-8 BOM CSV。
   - 上傳內政部 TGOS 批次比對系統處理，以 `import-tgos-geocode-results.mjs` 批次回寫經緯度與門牌。
3. **Phase 3：日常排程收斂長尾**
   - 極少數生僻門牌交由現有每日排程自動降級收尾。

### 2.6 安全防護與回滾機制 (Safety & Rollback)
- **快照備份表**：正式執行時自動建立 `facilities_geo_backup_YYYYMMDD`（備份 `id, address, lat, lng, geocode_attempts`）。
- **Chunked 更新**：每批 500 筆批次更新，防止鎖表。
- **一鍵 Rollback**：提供 `rollback-facilities-addresses.mjs` 隨時完整還原。

---

## 3. 線上資料庫驗證成果 (Dry-Run Verification)

透過遠端通道對線上資料庫（294,701 筆據點）全量驗證結果：
- **總掃描筆數**：294,701 筆
- **官方 GPS 座標完整保留**：153,208 筆（52.0%）
- **推算座標需重置/重定位**：129,091 筆（43.8%）
- **地址格式需正規化**：2,942 筆（1.0%）

---

## 4. 自動化測試規範

- 新增單元測試：`tests/renormalize-facilities-addresses.test.mjs`（8 項測試全數通過）。
- 回歸測試：全站 331 項測試無任何失敗，`npm run typecheck` 0 錯誤。
