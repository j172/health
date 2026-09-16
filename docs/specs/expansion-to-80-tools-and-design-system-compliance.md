# 全站擴充至 80 款工具與全維度設計規範對齊標準規格書

- **作者**：Antigravity Agent
- **日期**：2026-09-16
- **狀態**：Approved & In Implementation
- **關聯 Issue**：https://github.com/j172/health/issues/308 (#308)

---

## 1. 概述 (Overview)

本規格書定義本站將工具型錄 (`TOOL_CATALOG`) 由 67 款全面擴編至 **80 款工具**之標準規範、資料集來源、前端呈現架構與全站設計系統（Design System）對齊細節。

---

## 2. 新增 13 款開放資料工具架構矩陣

| # | Slug | 繁體中文名稱 | 所屬群組 | 前端架構 | 核心資料來源與開放資料集 |
|---|---|---|---|---|---|
| 1 | `health-supplements` | 健字號健康食品登記查詢 | `registry` | 客製化結構卡片與功效標籤 | 衛福部食藥署 (TFDA) 審查合格之健康食品與健字號許可登記名冊 |
| 2 | `sheltered-workshops` | 全國庇護工場與身障展售地圖 | `life-services` | `FacilitySearchContent` | 勞動部勞動力發展署身心障礙者庇護工場與產品服務據點 |
| 3 | `mental-health` | 全國心理諮商所與心衛中心地圖 | `care-facility` | `FacilitySearchContent` | 衛福部心理健康司立案心理諮商所、臨床心理所與社區心理衛生中心 |
| 4 | `smoking-cessation` | 戒菸治療與衛教特約院所查詢 | `care-facility` | `FacilitySearchContent` | 衛福部國民健康署二代戒菸特約醫療機構、門診與社區藥局 |
| 5 | `adult-preventive-care` | 成人健檢與公費癌症篩檢特約院所 | `care-facility` | `FacilitySearchContent` | 國健署 40 歲以上成人健康檢查與子宮頸抹片、乳房X光、糞便潛血、口腔黏膜四癌篩檢院所 |
| 6 | `baby-friendly-hospitals` | 全國母嬰親善認證醫療院所地圖 | `child-welfare` | `FacilitySearchContent` | 國健署認證通過之母嬰親善醫療院所（24小時母嬰同室與母乳哺育支援） |
| 7 | `rare-disease-care` | 罕見疾病照護諮詢中心與確診醫院 | `care-facility` | `FacilitySearchContent` | 國健署罕見疾病照護諮詢中心、遺傳諮詢中心與重大罕病確診醫院 |
| 8 | `organ-donation-hospitals` | 器官捐贈勸募網絡指定醫院查詢 | `care-facility` | `FacilitySearchContent` | 衛福部器官捐贈勸募網絡責任醫院名冊與意願簽署諮詢窗口 |
| 9 | `home-emergency-care` | 健保在宅急症照護特約機構查詢 | `care-facility` | `FacilitySearchContent` | 健保署在宅急症照護試辦計畫特約醫療機構（肺炎、泌尿道、軟組織感染在家施打抗生素） |
| 10 | `pesticide-sales` | 全國合法農藥與植物保護資材據點 | `environment` | `FacilitySearchContent` | 農業部動植物防疫檢疫署核發合法農藥販賣業執照業者名冊 |
| 11 | `green-shops` | 全國綠色商店與環保標章商品地圖 | `environment` | `FacilitySearchContent` | 環境部認證綠色商店、環保餐廳與碳標籤通路業者名冊 |
| 12 | `hearing-aid-subsidies` | 助聽器評估特約醫療院所名冊 | `life-services` | `FacilitySearchContent` | 衛福部社會及家庭署身心障礙輔具評估指定之助聽器聽力檢查特約院所 |
| 13 | `funeral-facilities` | 全國合法公私立殯葬設施與生命禮儀 | `life-services` | `FacilitySearchContent` | 內政部民政司立案公私立公墓、納骨塔骨灰骸存放設施、火化場與合法生命禮儀服務機構 |

---

## 3. 全站設計規範對齊標準 (Design System Compliance)

### 3.1 雙軌即時渲染與無阻斷載入
- 掛載時 t=0ms 立即使用中心預設點發起查詢與首次繪製。
- 絕不使用 `if (location.loading) return;` 阻斷首屏資料加載。
- GPS 授權於背景非同步處理，使用者允許後平滑無縫重算距離。

### 3.2 客戶端 5 秒安全熔斷與備援種子
- 所有非同步請求全面使用 `fetchWithTimeout(..., { timeoutMs: 5000 })`。
- 每款工具於 `data/facilities-seeds/` 建立代表性種子資料庫，斷網或初始部署時 100% 零空白。

### 3.3 視覺設計標準
- **現代字體排印**：使用 `font-sans` 與 `font-mono`（數字、電話、距離、代碼）。
- **深色模式 (Dark Mode)**：100% 適配 `dark:bg-slate-900`、`dark:border-slate-800`、`dark:text-slate-100`。
- **三態定位橫幅**：地圖類工具整合 `MapLocationBanner`（等待授權、預設提示、定位成功）。
- **微動畫回饋**：懸停、載入與過濾均具備柔和微動態 (`transition-all duration-200`)。

### 3.4 SEO 與結構化資料
- 每頁具備專屬 `Metadata`（Title、Description、Keywords、Canonical、OpenGraph）。
- `TOOL_CATALOG` 內提供繁體中文 `directAnswer` 與完整 `faqs` Schema 標註。
- 導航 (`SiteNav`) 與頁尾 (`SiteFooter`) 依照標準繁體筆劃音序 (`localeCompare('zh-Hant')`) 自動排序。
