# 全站客戶端請求逾時防護、雙軌即時渲染與離線降級容錯標準化規格書

- **作者**：Antigravity Agent
- **日期**：2026-09-16
- **狀態**：Implemented & Verified
- **關聯 Issue**：https://github.com/j172/health/issues/304 (#304)

---

## 1. 背景與問題陳述

在現代行動網路與分散式微服務架構下，使用者存取即時地圖與環境監測工具（如天氣、雨量、即時水深、YouBike、食安、戶外運動指數等）時，常面臨以下挑戰：

1. **客戶端請求無限懸掛（Hanging Requests）**：
   - 原生瀏覽器 `fetch()` 預設無逾時機制。當網路連線微弱、公共 Wi-Fi 轉圈或後端 API 回應延遲時，前端組件可能陷入無限旋轉（Loading Spinner），導致白屏或介面凍結。
2. **GPS 地位授權延遲阻塞首次內容繪製（FCP Blocked by Geolocation）**：
   - 原有部分工具頁面設置 `if (location.loading) return;`，必須強制等待瀏覽器原生 GPS 授權視窗獲得回應。
   - 若使用者猶豫不決或未注意彈窗，頁面長達 60 秒處於空白載入狀態，嚴重損害核心 Web 指標與使用者體驗。
3. **部分開放資料工具缺乏容災備援（Missing Fallback Datasets）**：
   - 蔬果食安（`FoodSafetyContent`）、積淹水地圖（`InundationMapContent`）及戶外運動安全（`OutdoorSafetyContent`）在遠端 API 斷線或未回傳資料時，直接呈現空狀態或報錯。

---

## 2. 核心架構與設計理念

### 2.1 集中式客戶端逾時守門員 (`lib/client/fetchWithTimeout.ts`)
- 封裝標準原生 `fetch()`，預設 5,000 毫秒（5s）逾時截斷。
- 透過 `AbortController` 結合 `Promise.race` 與 `setTimeout`，確保在超時時迅速 abort 網路傳輸並拋出標準 Error。
- 支援外部 `signal` 級聯綁定，組件 unmount 時可安全中斷進行中的請求。

```typescript
export async function fetchWithTimeout(
  input: RequestInfo | URL,
  options: FetchWithTimeoutOptions = {}
): Promise<Response>
```

### 2.2 雙軌即時渲染架構 (Dual-Track Instant Rendering)
- **第一軌（即時渲染）**：組件掛載（`useEffect`）後，立即採用目前已知座標（若已有 GPS 則使用，否則退回預設台北 101 中心 `GEO_DEFAULTS`）直接發起資料抓取與畫面渲染，達到秒開（Instant Paint）。
- **第二軌（平滑校準）**：背景同時非同步解析瀏覽器 GPS 定位。當使用者點擊「允許」並回傳精準經緯度後，前端自動觸發平滑重新抓取（Silent Re-fetch），依使用者真實位置更新周圍設施與排序，無需使用者手動重整。

### 2.3 地圖與工具零空白容災備援 (Zero-Empty Fallbacks)
- 為高度依賴遠端聚合的工具補齊具代表性的在地種子資料：
  - `FoodSafetyContent`：注入 `FALLBACK_FOOD_SAFETY_DATA`（蔬果農藥抽驗基準指標）。
  - `InundationMapContent`：注入 `FALLBACK_INUNDATION_DATA`（地下道引道水深即時感測與避難所種子）。
  - `OutdoorSafetyContent`：注入 `FALLBACK_OUTDOOR_DATA`（全台代表縣市戶外安全綜合評分）。

### 2.4 定位逾時優化 (`components/Facilities/useGeolocation.ts`)
- 將原先過長的 prompt 等待上限由 60 秒調降為合理的 12 秒（`PROMPT_TIMEOUT_MS = 12_000`）。
- 既有授權狀態逾時由 8 秒微調為 6 秒（`DECIDED_TIMEOUT_MS = 6_000`）。
- 既保障使用者有充裕時間點擊授權，又避免在忽略彈窗時無限等待。

---

## 3. 全站涵蓋組件與落實清單 (19 Components)

| 模組 / 組件路徑 | 逾時保護 | 雙軌渲染 | 容災備援 |
|---|:---:|:---:|:---:|
| `lib/client/fetchWithTimeout.ts` (Core Helper) | ✅ | — | — |
| `components/Facilities/useGeolocation.ts` | — | ✅ | ✅ |
| `components/Facilities/FacilitySearchContent.tsx` | ✅ | ✅ | ✅ |
| `components/Tools/AedContent.tsx` | ✅ | ✅ | ✅ |
| `components/DisasterMap/DisasterMapContent.tsx` | ✅ | ✅ | ✅ |
| `components/Tools/FoodSafetyContent.tsx` | ✅ | ✅ | ✅ (新注入) |
| `components/Tools/InundationMapContent.tsx` | ✅ | ✅ | ✅ (新注入) |
| `components/Tools/OutdoorSafetyContent.tsx` | ✅ | ✅ | ✅ (新注入) |
| `components/Tools/AccessibleTransitContent.tsx` | ✅ | ✅ | ✅ |
| `components/Tools/YoubikeContent.tsx` | ✅ | ✅ | ✅ |
| `components/Tools/LocalWeatherSvgWidget.tsx` | ✅ | ✅ | ✅ |
| `components/Tools/WeatherRainfallLocator.tsx` | ✅ | ✅ | ✅ |
| `components/Tools/NearbyRainfallCard.tsx` | ✅ | ✅ | ✅ |
| `components/Tools/useNearestStation.ts` | ✅ | ✅ | ✅ |
| `components/News/NearbyWeatherBar.tsx` | ✅ | ✅ | ✅ |
| `components/Activities/PublicArtContent.tsx` | ✅ | ✅ | ✅ |
| `components/BreastfeedingRooms/BreastfeedingMapContent.tsx` | ✅ | ✅ | ✅ |
| `components/ContraceptionMap/ContraceptionMapContent.tsx` | ✅ | ✅ | ✅ |
| `components/DengueMosquitoMap/DengueMosquitoMapContent.tsx` | ✅ | ✅ | ✅ |
| `components/HeritageMap/HeritageMapContent.tsx` | ✅ | ✅ | ✅ |

---

## 4. 驗證與測試計畫

### 4.1 自動化單元測試
- 新增 `tests/fetchWithTimeout.test.mjs`，完整涵蓋：
  1. 正常請求在時限內成功回應。
  2. 模擬延遲超過 `timeoutMs` 時拋出超時例外並中斷請求。
  3. 外部傳入 `AbortSignal` 時正確聯動中斷。
- 執行指令：`npm test`（目標：全量測試通過）。

### 4.2 TypeScript 靜態型別檢驗
- 執行指令：`npm run typecheck`（`tsc --noEmit`，目標：0 錯誤）。

### 4.3 生產構建與部屬檢核
- 執行 GitHub Actions 部署工作流程，並檢驗線上環境直出無報錯。
