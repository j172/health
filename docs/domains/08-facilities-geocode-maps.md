# 08 設施資料、地理編碼與地圖技術

> 合併自 13 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相

### 1.1 `facilities` 主表
- 約 29 萬筆，以 `facility_type` 區分約 37 種（clinic、pharmacy、aed、long_term_care、public_toilet、cool_spot、kindergarten…），以 `(source_key, source_id)` 為 upsert 唯一鍵。
- 約 15 萬筆自帶官方 GPS（醫院、藥局、公廁、長照等），**受白名單保護、不得被重新 geocode 覆蓋**。
- 查詢層（`lib/server/facilities/queries.ts`）把 MySQL `DECIMAL` 座標轉成 number（mysql2 預設回傳字串）。
- 附近搜尋：預設半徑 10 公里，結果太少時自動擴大半徑，並回傳全國總數，避免把「附近 4 筆」誤讀成「資料只有 4 筆」。

### 1.2 地理編碼供應鏈

| 順位 | 供應商 | 額度 | 用途 |
|---|---|---|---|
| 1 | TGOS 全國門牌定位 | 5,000／日 | 即時主要 geocoder |
| 2 | OpenCage | 1,400／日（政策上限） | 備援，402／429 觸發斷路器 |
| 3 | Nominatim | 1,000／日 | 備援 |
| — | TGOS 批次比對 | 10,000 筆／日 | 離線 CSV 匯出 → 上傳 → 回寫（NPO 等大宗資料） |
| — | 開放資料預定位 | — | 以健保代碼或名稱＋地址比對既有 GeoJSON，`opendata-geo-backfill.yml` 排程執行 |

- 22 個來源共用每日預算；以 DB 持久化的輪替游標（`geocodeSourceRotation.ts`）確保每個來源都輪得到。
- 縣市邊界防護：geocode 結果落在地址所屬縣市以外即拒絕（曾有臺中、花蓮、臺南機構被定位到臺北）。

### 1.3 地圖
- 9 個 react-leaflet 元件（防災、文化資產、哺集乳室、避孕、AED、淹水、停水、中油、設施通用），皆共用 `components/Common/MapViewController.tsx`（`flyTo` 動畫＋定位圖示）。
- 底圖目前寫死 `{s}.tile.openstreetmap.org`；2.0 將收斂為單一 `BaseMap`，改用國土測繪中心 EMAP、OSM 備援。

---

## 2. 長期有效的決策

- 不得粗暴全量重抓座標：會耗盡外部額度數十天，且讓官方高精度座標降級。
- 不得對 OSM／Nominatim 做大量突發請求；遵守每秒 1 次。
- 地址正規化只對「副本」操作，原始地址欄位永不改寫；正規化有對應的回滾腳本。
- 地圖技術統一用 Leaflet；不引入需要 API key 的 Google Maps 互動地圖（導航只用 Google Maps 深連結）。

---

## 3. 核對後仍未完成的項目

已併入 2.0（Issue #438）：統一 `BaseMap`、EMAP 底圖、底圖 URL 設定化、單一 `useLocation` hook（目前 25 個檔案各自呼叫定位）。

---

## 4. 逐份紀錄

#### Phase 9 — 綠色商店 OpenCage 批次定位 ✅
- 原檔：[phase9-opencage-geocode-batch.md](../archive/specs/phase9-opencage-geocode-batch.md)
- 每 10 分鐘最多 10 筆；OpenCage 每秒 1 次、每日 1,400；402／429 斷路；之後改 Nominatim；不呼叫未設定的 Google。後續擴大為全部 22 個來源的統一批次。

#### TGOS 成為主要 geocoder ✅
- 原檔：[tgos-primary-geocoder.md](../archive/specs/tgos-primary-geocoder.md)（#180）
- OSM 系對台灣門牌號完整度低，常退化到道路中心點；改由 TGOS 擔任第一順位。

#### TGOS 批次門牌比對工作流 ✅
- 原檔：[tgos-batch-geocoding-workflow.md](../archive/specs/tgos-batch-geocoding-workflow.md)
- `npm run export:tgos`（UTF-8 BOM、每檔 10,000 筆、依商品 NPO → NPO Center → 一般 NPO 排序）與 `npm run import:tgos` 回寫。

#### 地址輕度正規化、官方 GPS 白名單、智慧重算 ✅
- 原檔：[facilities-address-normalization-and-smart-geocoding.md](../archive/specs/facilities-address-normalization-and-smart-geocoding.md)（PR #334）
- 全形數字、括號備註、重複縣市前綴（「新北市土城區新北市土城區…」）、多地址並列；舊 geocoder 把同路不同門牌全部定在同一點。提供 `renormalize:facilities` 與 `rollback:facilities`。

#### 修正跨縣市座標錯配 ✅
- 原檔：[fix-facility-cross-county-coordinate-mismatch.md](../archive/specs/fix-facility-cross-county-coordinate-mismatch.md)（#196）
- Nominatim 對冷門路名做模糊比對，加上「, 台灣」後綴，把外縣市伯公站定位到臺北同名路；新增 `countyBounds.ts` 邊界檢查與村里門牌正規化。

#### 查詢層統一轉換 DECIMAL 座標 ✅
- 原檔：[decimal-coords-coercion.md](../archive/specs/decimal-coords-coercion.md)（#64）
- 12 張表的 DECIMAL 座標被 mysql2 以字串回傳，型別卻宣告 `number`；地標回填曾被迫用 epsilon 比較繞過。

#### 附近搜尋自動擴大與誠實總數 ✅
- 原檔：[facility-nearby-fallback-and-honest-total.md](../archive/specs/facility-nearby-fallback-and-honest-total.md)
- 伯公站資料 611 筆，從臺北打開只顯示「共 4 筆」；加入擴大半徑後備與全國總數（`allTotal`）。

#### 開放資料預定位回填排程化 ✅
- 原檔：[opendata-geo-scheduled-backfill.md](../archive/specs/opendata-geo-scheduled-backfill.md)
- 先前一次性在正式環境跑過、腳本卻從未提交；改為提交三支回填腳本並建立 `opendata-geo-backfill.yml`。

#### 剩餘 geocode 來源的開放資料座標缺口研究 📚
- 原檔：[geocode-opendata-coverage-gap-research.md](../archive/specs/geocode-opendata-coverage-gap-research.md)（36KB）
- 22 個來源只有 3 個有預定位的開放資料替代；逐一調查其餘來源是否有官方帶座標版本，作為降低外部 geocode 依賴的依據。

#### 地圖技術一致性盤點（工單） 📚
- 原檔：[map-technology-consistency-audit.md](../archive/specs/map-technology-consistency-audit.md)

#### 地圖技術盤點結果與建議 📚
- 原檔：[map-technology-findings.md](../archive/specs/map-technology-findings.md)（#341）
- 六類地圖相關程式碼（Leaflet、OSM iframe、裝飾性 SVG、名不副實的「地圖」等）；8 個 Leaflet 元件技術一致，僅停水地圖自行重寫控制器。

#### 中油站點地圖接上共用 MapViewController ✅
- 原檔：[cpc-station-map-shared-controller-gap.md](../archive/specs/cpc-station-map-shared-controller-gap.md)（#244、PR #245、#247）

#### 停水地圖改用共用 MapViewController ✅
- 原檔：[water-outages-leaflet-shared-controller.md](../archive/specs/water-outages-leaflet-shared-controller.md)
