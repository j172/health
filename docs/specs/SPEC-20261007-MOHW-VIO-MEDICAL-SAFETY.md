# SPEC-20261007-MOHW-VIO-MEDICAL-SAFETY: 衛福部醫事人員性平專區（狼醫平台）雙軌整合與就醫安全查詢

- **狀態**: APPROVED
- **建立日期**: 2026-10-07
- **關聯 Issue**: [#432](https://github.com/j172/health/issues/432)
- **實作工單**: [`docs/tickets/TICKET-20261007-MOHW-VIO-MEDICAL-SAFETY.md`](file:///d:/GoogleDrive/health/docs/tickets/TICKET-20261007-MOHW-VIO-MEDICAL-SAFETY.md)
- **資料來源**:
  - 衛生福利部 醫事查詢系統 - 醫事人員性別事件資訊專區 (https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO)
  - 司法院裁判書系統 (https://judgment.judicial.gov.tw)
  - 地方政府公報（臺北市、新北市、桃園市、新竹市、花蓮縣等）

---

## 1. 核心動機與背景 (Problem Statement & Motivation)

面對醫療環境中性別暴力、強制猥褻與性平事件之威脅，病患在診間往往處於資訊不對稱與高度脆弱之境地。衛生福利部於 2025 年正式上線「醫事人員性別事件資訊專區」（俗稱狼醫平台），公開經法院裁判或醫事審議懲戒確定之違法醫事人員名冊。

為落實民眾就醫知情權與公眾安全防護，本專案採「**雙軌並行 (Hybrid)**」模式整合：
1. **官方倡議與友站串聯**：於首頁大卡片、全站頁尾與基層醫療工具（診所查詢）置入外連導流卡片，直接導向衛福部專區與相關司法院裁判。
2. **站內獨立查詢專頁與定期排程爬取**：
   - 建立 Node.js 爬蟲定期遍歷 18 項醫事類別（醫師、中醫師、牙醫師、藥事人員、醫事檢驗人員、放射師、護理人員、心理師等）。
   - 快取更新於 `data/medical-violators-seed.json`。
   - 建立獨立工具頁 `/tools/medical-violators`（醫事人員性別事件查詢），提供毫秒級即時搜尋、縣市/專業分類篩選、裁判書直達按鈕與權威免責注意事項。

---

## 2. 規格細節 (Specification)

### 2.1 公民倡議與友站登錄 (`mohw-vio`)
- **唯一識別碼**: `mohw-vio`
- **卡片名稱**: 衛福部醫事性平專區
- **頁尾名稱**: 衛福部醫事性平專區 ↗
- **官方網址**: `https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO`
- **追蹤 UTM**: `utm_source=health.j172.tw&utm_medium=civic_partner&utm_campaign=civic_alliance&utm_content=mohw_vio`
- **視覺規範**:
  - 圖示: `🩺` (Stethoscope)
  - 徽章文字: 「就醫安全」
  - 徽章樣式: Rose 玫瑰紅系 (`bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900`)
  - 標籤文字: `就醫安全 ‧ 違法醫事名單`
  - 描述說明: 衛福部官方公告經法院確定判決或主管機關懲戒之涉及性平事件醫事人員名單，落實病患就醫安全與防護知情權。
- **排序規則**: 放置於 `sports-coach` 後方：
  `g0v` ➔ `kuma` ➔ `anti-cw` ➔ `metawilo` ➔ `sports-coach` ➔ `mohw-vio` ➔ `council2026`。

### 2.2 站內獨立工具頁 (`/tools/medical-violators`)
- **路由路徑**: `/tools/medical-violators`
- **目錄分組**: `care-facility` (醫療照護機構)
- **導覽名稱**: 醫事性平查詢
- **標題名稱**: 醫事人員性別事件查詢（狼醫專區）
- **結構化資料**: `ToolPageShell` 自動構建 `MedicalWebPage` + `FAQPage` + `WebApplication`。
- **UI 與互動功能**:
  1. **即時文字過濾**: 支援醫師/人員姓名、執業專科、證書字號關鍵字查詢。
  2. **專業分類按鈕**: 「全部」、「醫師」、「中醫師」、「放射師」、「藥事人員」、「護理人員」等動態過濾。
  3. **縣市下拉過濾**: 「全部縣市」、「臺北市」、「新北市」、「臺中市」、「高雄市」等。
  4. **案件資訊與處分標籤**:
     - 顯示懲戒/裁判標籤（如「裁判1」、「懲戒1」）。
     - 提供司法院裁判書、縣市公報 PDF、衛福部處分公告之直達外部連結。
     - 執業狀態標註（「已廢證」、「歇業」、「執業中」）。
  5. **注意事項與免責說明**:
     - 本專區以 112 年性平三法修正迄今主管機關整理公開資訊為主。
     - 符合個人資料保護法第 16 條但書第 2 款「增進公共利益所必要」規定。
     - 相關裁判是否確定，以司法院裁判書系統個別案件網頁所載「歷審裁判」為準。
  6. **雙向內部連結**:
     - 引導至 `/tools/clinics`（全臺診所查詢）與 `/tools/baby-friendly-hospitals`。

### 2.3 情境式工具串聯 (`/tools/clinics`)
- 在 `/tools/clinics`（全臺診所查詢）主要篩選條件上方，加入情境卡片：
  - 標題：就醫安全防護與醫事人員查核
  - 內文：就診前可透過衛福部「醫事人員性別事件資訊專區」及站內「醫事人員性別事件查詢」，查驗經司法或行政懲戒確定之違法名冊。
  - 按鈕：站內快速查核 (`/tools/medical-violators`) 與 官方專區 ↗ (`https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO`)。

### 2.4 資料爬蟲與排程 (`scripts/sync-medical-violators.mjs`)
- **資料來源端點**: `https://ma.mohw.gov.tw/Accessibility/VIOSearch/MASearchVIO`
- **無障礙解析技術**:
  - 先以 GET 請求獲取 session cookies、`__RequestVerificationToken` 及 `data-code` 驗證碼明文。
  - 對 18 大醫事代碼（A, B, C, D,E, F,G, H,I,J,K, L,M, Z, Q,U, S,T, R,W, Y, X, V, 1, 3, 2,4, 5,6）發送 POST `/Accessibility/VIOSearch/VIODataList`。
  - 正規化提取姓名、專科別、執業縣市、證書字號、處分案由與裁判連結。
  - 輸出至 `data/medical-violators-seed.json`。
- **GHA 工作流程**: `.github/workflows/medical-violators-sync.yml`（每週排程與手動 dispatch）。

---

## 3. 測試與驗證計畫 (Verification Plan)
1. **單元測試**:
   - `lib/constants/contextualPartners.test.mjs`：驗證 `mohw-vio` 正確註冊與欄位型別。
   - `tests/mohw-vio-medical-safety.test.mjs`：驗證爬蟲產出資料格式、catalog 登錄與頁面元件連結。
2. **型別檢查**: `npm run typecheck` 確保 0 錯誤。
3. **全站測試**: `npm test` 確保全部既有與新增測試通過。
