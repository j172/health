# 規格書：衛福部長照地理資訊系統（LTC GIS）全生態系資料整併與去重

## 1. 概述 (Overview)

本規格書定義並規範本站「長照服務機構查詢」（`/tools/long-term-care`）整合衛生福利部長照地理資訊系統（https://ltcpgis.mohw.gov.tw/）10 大開放資料集之架構標準與實作細節。

### 背景問題
- 原先本站 `/tools/long-term-care` 僅匯入 `ltc.csv`（約 4,100 筆機構），且 `service_item` 欄位為 NULL，導致前端分類篩選器（居家服務、日間照顧等）無法精準過濾。
- 長照特約機構 `all.csv`（約 1.5 萬筆機構）先前以 `ltc_contracted` 存放，雖有 308 跳轉但造成資料庫兩份名冊分離、無法交叉呈現評鑑與床位資訊。
- `ltcpgis.mohw.gov.tw` 包含完整的機構評鑑結果（`eval.csv`）、住宿機構床位與住民數據（`res.csv`）、喘息服務細項（`g_pi400.csv`）及失智/家照/關懷據點，未曾有效整併。

### 核心原則
1. **機構代碼主體去重**：核心長照機構以「`機構代碼`」為唯一主鍵進行去重與交叉補充。
2. **服務項目全量聚合**：合併機構法定種類（居家式/社區式/機構式/綜合式）與所有長照 2.0 特約服務項目。
3. **擴充欄位結構化**：將開放床數、現有住民、空床數（`emptySeats`）、特約級別（`abcLevel`）、衛福部評鑑結果（`evaluations`）與喘息細項存入 `extra_json`。
4. **專門據點資源收錄**：將失智共同照護中心、失智社區服務據點、家庭照顧者支持據點、社區照顧關懷據點與國健署預防延緩失能據點統一以 `facility_type = 'long_term_care'` 納入索引。
5. **前端智慧標章展示**：直覺呈現空床狀況徽章、評鑑等第徽章與特約 ABC 等級。

---

## 2. 來源資料集對照 (Source Datasets Taxonomy)

| 資料集 | 來源檔名 | 筆數規模 | 處理策略與欄位對照 |
|---|---|---|---|
| **長照機構名冊** | `ltc.csv` | 4,114 | 機構代碼對齊；解析機構種類（1 居家、2 社區、3 機構、4 綜合） |
| **長照特約與巷弄站** | `all.csv` | 23,304 | 機構代碼對齊；聚合特約服務項目；提取 A/B/C 級特約層級 |
| **住宿機構與床位** | `res.csv` | 2,205 | 機構代碼對齊；開放床數與現有住民入庫；計算剩餘空床數 |
| **機構評鑑結果** | `eval.csv` | 123 | 機構代碼對齊；評鑑實施年度、等第結果與合格效期起迄進 `extra_json.evaluations` |
| **喘息服務明細** | `g_pi400.csv` | 4,699 | `O_CODE` 機構代碼對齊；解析 GA03~GA09 各類喘息代碼與服務標籤 |
| **失智共同照護中心** | `dementia_care.csv` | 143 | `source_key: "mohw_dementia_care"`；收錄就醫診斷、照護諮詢、轉介等項目 |
| **失智社區服務據點** | `dementia_service.csv` | 623 | `source_key: "mohw_dementia_service"`；收錄認知促進、安全看視、照顧課程、支持團體 |
| **家庭照顧者支持據點** | `caregiver.csv` | 165 | `source_key: "mohw_caregiver"`；收錄服務對象、服務區域與據點類型 |
| **社區照顧關懷據點** | `ccare.csv` | 3,967 | `source_key: "mohw_ccare"`；收錄村里據點資訊 |
| **預防延緩失能方案** | `hpa.csv` | 204 | `source_key: "mohw_hpa_prevention"`；收錄國健署社區預防方案與聯絡窗口 |

---

## 3. 資料結構與 Schema 規範

### 3.1 `extra_json` 擴充型別定義
```typescript
export interface FacilityEvaluation {
  year: string;
  result: string;
  validUntil: string;
  start?: string;
  end?: string;
}

export interface FacilityExtraJson {
  weeklyHours?: Record<string, string[]>;
  weeklyHoursNote?: string;
  penalty?: FacilityPenaltyInfo | Record<string, unknown>;
  charityUrl?: string;
  charityName?: string;
  openBeds?: number | string | null;
  currentResidents?: number | string | null;
  emptySeats?: number | string | null; // 空床數或 "滿床"
  abcLevel?: string | null;            // "A" | "B" | "C"
  evaluations?: FacilityEvaluation[];
  respiteCodes?: string[];             // ["GA03", "GA04", ...]
  serviceDistrict?: string | null;
  serviceObject?: string | null;
  [key: string]: unknown;
}
```

---

## 4. 前端卡片展示規格 (UI / UX)

- **空床標籤**：
  - 剩餘床位 > 0：顯示綠色標籤 `🛏️ 空床 X 床（總 Y 床）`。
  - 剩餘床位 <= 0：顯示灰色標籤 `🛏️ 滿床`。
- **評鑑標籤**：
  - 若有評鑑合格紀錄：顯示金色標籤 `🏅 評鑑：114年 合格`，hover 提示合格效期。
- **長照等級**：
  - 標示 `A 級旗艦`（藍色）、`B 級特約`（藍綠色）、`C 級巷弄站`（橙色）。
- **篩選器分類擴充**：
  - 居家服務、日間照顧、喘息服務、住宿型機構/護理之家、家庭托顧、專業照護、交通接送、輔具與居家無障礙改善、巷弄長照站、小規模多機能。
  - 專門據點：`🧠 失智共同照護中心`、`🧩 失智社區服務據點`、`🤝 家庭照顧者支持據點`、`🏡 社區照顧關懷據點`、`🌱 預防及延緩失能`。

---

## 5. 同步與清理機制

1. **同步腳本**：`scripts/import-mohw-ltc-gis.mjs`。
2. **舊特約清理**：後端 `/api/admin/facilities-import` 支援 `cleanFacilityType: "ltc_contracted"`，匯入時一併安全清理廢棄舊資料。
3. **日常維護**：納入 `scripts/run-six-monthly-sync.sh` 定期維護說明。
