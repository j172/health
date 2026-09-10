# SPEC-HEALTH-20260911-TGOS-BATCH-GEOCODING-WORKFLOW

## 1. 背景與目標 (Background & Objectives)
全台公益組織 (NPO) 與稅籍機構 (`facilities` 表中 `facility_type IN ('npo', 'tax_organization')`) 數量達 99,000+ 筆。由於多數機構僅有門牌地址尚未轉換座標，而一般的即時 Map API 存在每日 2,500 次配額或需伺服器固定 IP 白名單之限制。

內政部 TGOS（地理資訊圖資雲服務平台）及新版「地址識別碼系統」提供**「全國門牌地址定位及批次門牌地址比對服務」**，具備以下決定性優勢：
1. **不需要綁定伺服器 IP 白名單**（無 IP 限制）。
2. **每日批次處理上限達 10,000 筆**（高於 OpenCage 4 倍，且具備台灣最精準之官方戶政門牌號碼圖資）。
3. 支援標準 CSV 檔案上傳比對與結果下載。

本規格旨在建構一套標準、健壯且可重複使用的批次地址比對工作流程，提供待比對清單匯出工具與比對結果批次回寫入庫工具。

---

## 2. 工具架構設計 (Tool Architecture)

### 2.1 待比對清單匯出工具 (`scripts/export-facilities-for-tgos.mjs`)
* **資料來源**：`facilities` 表中 `lat IS NULL AND address IS NOT NULL AND TRIM(address) != ''` 之據點。
* **排序優先權**：
  1. 具備公益商品販售之組織 (`extra_json LIKE '%"hasProducts":true%'`)
  2. 台灣公益資訊中心收錄之機構 (`source_key = 'npo_tw'`)
  3. 一般公益組織與稅籍團體 (`facility_type IN ('npo', 'tax_organization')`)
  4. 其他類型待定位設施
* **輸出格式**：
  * 欄位：`id,Address`
  * 編碼：UTF-8 with BOM (`\uFEFF`)，防止 Windows Excel 與 TGOS 平台解析中文字元出現亂碼。
  * 批次切分：預設單檔上限 10,000 筆（符合 TGOS 單日上限），多餘資料自動切為 `tgos_pending_batch_1.csv`, `tgos_pending_batch_2.csv` 等。
* **參數支援**：
  * `--type=npo,tax_organization`：指定設施類型（預設為公益組織）。
  * `--all`：匯出所有類型未定位設施。
  * `--limit=10000`：限制單次總匯出筆數。
  * `--out-dir=data/tgos`：指定輸出目錄。

### 2.2 比對結果匯入與回寫工具 (`scripts/import-tgos-geocode-results.mjs`)
* **輸入檔案**：TGOS 批次服務產出之下載 CSV 檔案。
* **欄位容錯解析**：
  * ID 欄位識別：`id`, `ID`, `序號`, `編號`
  * 原始地址欄位：`Address`, `address`, `原始地址`
  * 比對門牌欄位：`Response_Address`, `比對門牌地址`, `FULL_ADDR`
  * X 坐標（經度）：`Response_X`, `X`, `x`, `lng`, `lon`
  * Y 坐標（緯度）：`Response_Y`, `Y`, `y`, `lat`
* **坐標驗證與投影轉換**：
  * 支援 WGS84 經緯度（EPSG:4326，經度 118~123，緯度 21~27）。
  * 若比對結果為 TWD97 二度分帶坐標（X ~150000..350000，Y ~2400000..2800000），自動轉換為 WGS84 經緯度。
  * 嚴格經過 `isWithinTaiwanBounds` 邊界檢查。
* **資料庫批次回寫**：
  * 採用 Chunked Batch Update，批次更新 `lat`, `lng`, `updated_at = NOW()`, `geocode_attempts = 0`。
  * 若有比對成功的標準門牌地址，寫入 `extra_json` 之 `tgosAddress` 屬性。
  * 提供 `--dry-run` 模式以供驗證筆數與坐標正確性。

---

## 3. 測試與驗證準則 (Verification Criteria)
1. 單元測試驗證：
   * 驗證 TGOS 匯出 CSV 格式正確無誤且包含 UTF-8 BOM。
   * 驗證 TGOS 下載結果多種欄位命名相容性解析。
   * 驗證 WGS84 與 TWD97 坐標校驗與邊界防護。
2. 模擬乾跑：
   * 執行 `--dry-run` 確保匯出與匯入流程平穩無例外。
