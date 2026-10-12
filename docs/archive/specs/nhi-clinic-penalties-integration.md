# 健保署醫療院所違規、停約與五年不予特約名冊整合規格書 (NHI Clinic Penalties Integration)

## 1. 背景與目標 (Background & Objectives)
衛生福利部中央健康保險署（NHI）定期公開健保特約醫事機構之懲處與管制名冊，包含：
1. **違規情節重大名冊** (`dl-75736`)：記載終止特約、重大違規虛報點數等機構與負責人。
2. **停約名冊** (`dl-75737`)：記載停約處分、暫緩執行等機構與處分事由。
3. **五年內不予特約之地址** (`dl-75738`)：防止違規診所於原址重開之管制門牌地址。
4. **五年內不予特約之醫事機構及負責醫事人員** (`dl-87941`)：受五年管制之機構與負責人。

本規格旨在將上述 4 份懲處資料庫無縫整合至 `https://health.j172.tw/tools/clinics`（醫療院所查詢），落實資訊公開與民眾就醫安全知情權，並透過嚴謹的時效判定避免醫療爭議。

---

## 2. 系統架構與決策總結 (Architectural Decisions)

依據 Grilling 決策共識，系統實作採以下原則：

### 2.1 產品定位與 UX
- **整合型警示標籤 + 獨立篩選分類**：
  - 在現有 `/tools/clinics` 工具頂部分類標籤列新增 `⚠️ 違規／停約名單` Pill 按鈕。
  - 點選後直接列出全台所有受處分之機構與管制地址，並原生支援輸入診所名、醫師名、縣市地址等關鍵字檢索。

### 2.2 資料模型與儲存 (Data Modeling)
- 統一納入 `facilities` 主資料表 (`facility_type = 'clinic'`)：
  - **既有特約院所**：依「醫事機構代碼」匹配，將懲處紀錄注入其 `extra_json.penalty`，保留其原本地址與經緯度。
  - **已除名之違規機構與純地址**：以 `source_key = 'nhi_penalty'` 獨立建檔至 `facilities` 表，享有系統既有的地理編碼（Geocoding）與周邊半徑雷達搜尋。
  - **純地址命名**：名冊 3 命名為 `[健保管制地址] 縣市鄉鎮市區 + 路名門牌`，`service_item` 標示為 `五年不予特約地址`。

### 2.3 時效性與狀態判定 (Lifecycle & Status)
- 民國日期格式（如 `1150801`）動態轉換為西元（`2026-08-01`）並與當前時間比對：
  - **處分進行中**：🛑 `健保處分中（停約/終止至 YYYY/MM/DD）`
  - **暫緩執行**：⚠️ `處分暫緩執行中`
  - **已期滿**：ℹ️ `歷史處分紀錄（已於 YYYY/MM/DD 期滿）`，明確註明已期滿以防法律與就醫誤解。

### 2.4 資訊揭露與卡片排版 (UI Disclosure)
- **卡片右上角狀態標籤**：醒目標示處分狀態。
- **可折疊展開詳情（Accordion）**：點擊「🔻 查看健保處分詳情」展開折疊區塊，揭露負責醫事人員、處分類別、處分原由、引用法規條款與執行起訖日。

### 2.5 同步管線與防脆斷設計 (Data Pipeline)
- **雙軌機制**：
  - 後端模組 `lib/server/facilities/sources/nhiPenalties.ts` 整合進 `runFacilitySync` 常態定期同步。
  - 提供獨立 CLI 腳本 `scripts/import-nhi-penalties.mjs`，支援自訂 URL 與本機 CSV 檔案覆寫，預防健保署檔案更換 Hash。

---

## 3. 欄位結構定義 (Data Schema)

在 `facilities.extra_json` 欄位中定義 `penalty` 物件：

```typescript
export interface FacilityPenaltyInfo {
  status: "active" | "suspended_execution" | "expired";
  category: string; // 例如 "終止特約", "停約3個月", "五年不予特約"
  reason?: string; // 違規虛報事由
  clauses?: string; // 引用法規條款
  practitioner?: string; // 負責醫事人員 / 行為人
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  rawMinguoRange?: string; // 原文起訖字串
  sourceTitle: string; // 名冊名稱
}
```

---

## 4. 驗收標準 (Acceptance Criteria)

1. `scripts/verify-nhi-penalties.test.mjs` 通過所有資料解析、民國日期轉換與時效狀態比對測試。
2. 4 份 CSV 能被正確下載、解析，且能正確 Enrich 現有院所或獨立建檔。
3. `/tools/clinics` 頁面顯示「⚠️ 違規／停約名單」分類按鈕，點擊能正確過濾資料。
4. 命中的卡片具有對應警示標籤（處分中 / 暫緩執行 / 歷史期滿），且能折疊展開查看裁處細節。
5. `npm test` 與 `npm run build` 通過。
6. 透過 GitHub Issue、Worktree 實作、發 PR、Merge 到 main 並觸發部署。
