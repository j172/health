# SPEC-HEALTH-20260911-NPO-ADDRESS-ENRICHMENT-PIPELINE

## 1. 背景與目標 (Background & Objectives)
全台非營利團體與公益機構 (`facilities` 表中 `facility_type IN ('npo', 'tax_organization')`) 目前共有 99,377 筆。經盤點確認：原始財政部扣繳名冊資料集僅公佈縣市名稱（如「臺北市」、「基隆市」），缺乏具體路街巷弄門牌，導致使用者在搜尋或導航時無實體地址可用。

為解決此問題，本規格規劃建立四層遞進式「NPO 實體門牌地址補齊管道 (NPO Address Enrichment Pipeline)」：
1. **Tier 1 (最優先)：61 家庇護工場公益禮盒入庫**：
   立即將 61 家庇護工場與身障福利機構之實體門牌、電話、直達商城與 WGS84 座標回寫線上資料庫。
2. **Tier 2 (核心主力)：NPO Center 7,850 家活躍非營利組織門牌與官網自動化同步**：
   建立管理端同步端點 `/api/admin/npo-sync` 與 GitHub Actions 定時排程工作流程，平滑消化 457 頁實體門牌、電話、聯絡人與官方網站。
3. **Tier 3 (座標轉化)：串接 TGOS 批次門牌比對工作流**：
   當機構門牌地址補齊後，自動進入 `npm run export:tgos`，送交 TGOS 進行每日萬筆之高精度坐標比對，完成精確門牌經緯度覆蓋。

---

## 2. 架構與實作設計 (Architecture & Implementation)

### 2.1 庇護工場入庫模組升級 (`scripts/ingest-sheltered-workshops.mjs`)
* 加入 SSH loopback 遠端主機執行支援（相容本地無直接 MySQL 連線之開發情境）。
* 載入 `data/sheltered-workshops.json`，對齊現有 `facilities` 進行原地升級（`hasProducts = true`, `storeUrl`, `productNote`）或新增獨立據點。
* 直接同步真實實體門牌與 WGS84 經緯度坐標。

### 2.2 NPO Center 管理端同步端點 (`app/api/admin/npo-sync/route.ts`)
* 路由端點：`POST /api/admin/npo-sync`
* 認證防護：`x-rss-sync-admin-secret` 標頭校驗。
* 參數支援：
  * `startPage` (預設 1)
  * `maxPages` (預設 5，避免超過單次 HTTP 逾時)
* 執行機制：
  * 呼叫 NPO Center 抓取模組，解析清單與詳細頁。
  * 比對統一編號或名稱正規化去重，補齊實體門牌地址、電話、官網、負責人與機構屬性。
  * 回傳本次處理筆數、更新筆數與新增筆數。

### 2.3 GitHub Actions 自動排程 (`.github/workflows/npo-organizations-sync.yml`)
* 觸發條件：
  * `schedule`: 每日兩次定時排程。
  * `workflow_dispatch`: 支援手動觸發，可指定 `start_page` 與 `max_pages`。
* 執行步驟：
  * 透過 SSH loopback 或本機環境呼叫 `/api/admin/npo-sync`。
  * 維持禮貌請求間隔，平滑前進批次進度。

---

## 3. 測試與驗證準則 (Verification Criteria)
1. 單元測試：
   * 確保所有 NPO parser 與庇護工場單元測試持續 100% 通過。
2. 線上驗證：
   * 執行 61 家庇護工場入庫後，檢驗線上 API 端點 `/api/npo-organizations?hasProducts=true` 應回傳有效庇護工場筆數。
   * 測試 `/api/admin/npo-sync` 成功爬取第一批實體門牌並寫入資料庫。
3. 靜態檢查：
   * `npx tsc --noEmit` 0 錯誤。
