# 全站列表預設 30 筆、分頁器 (30/50/100) 與極細結構化搜尋規格說明書

- **狀態**：Approved (經正體中文 Grill Me 審定共識)
- **領域**：前端元件架構、後端 API 伺服器端分頁、多維度地理與類別篩選
- **目標**：落實全站清單工具預設 30 筆、分頁器 (30/50/100)、22 縣市＋368 鄉鎮區二級聯動極細搜尋、最新／距離雙軌排序與地圖 1:1 分頁連動

---

## 1. 背景與核心問題

目前全站累積至 80 款健康與公共生活工具，但在各列表的使用者體驗上存在以下痛點：
1. **列表筆數不一與欠缺標準分頁器**：部分工具單頁列出全部，部分工具硬編碼限制 10~50 筆，使用者無法翻閱完整全台數萬筆資料（如診所 2.3 萬間、藥局 8 千間），亦無法自由切換 30/50/100 筆每頁密度。
2. **搜尋條件粗糙**：多數工具僅具備單一「關鍵字」文字框，使用者必須手動輸入完整行政區（如「板橋區」或「中西區」），缺乏結構化快速篩選。
3. **缺少「最新」維度**：地圖類設施僅有以距離為主的排序，當使用者想查看全台或各縣市「最新登記／最新加入」的機構時無從得知；純資料類亦需確保最新收錄排在最前。
4. **地圖圖釘與列表脫節**：在大資料量下，若一次繪製數百個標記會造成 DOM 與 Leaflet 渲染遲緩，且翻頁時地圖無動態包夾聚焦當前頁面據點。

---

## 2. 規格共識與核心決策 (Grill Me 審定)

1. **列表預設與雙軌排序策略**：
   - **地理設施地圖類 (35+ 款)**：初始預設為以使用者所在位置或所選縣市為中心的「距離最近 30 筆」；排序選單新增「最新登記／更新」、「名稱筆畫」、「距離最近」三向切換。
   - **純資料／活動／新聞類**：初始預設一律列出全台灣「最新收錄／發布 30 筆」。
2. **結構化極細篩選**：
   - 全面提供「22 縣市 ＋ 368 鄉鎮市區二級聯動」下拉選單，切換縣市時自動連動對應鄉鎮清單。
   - 保留各業務之「類別標籤」（如健保特約別、醫院層級、認證功效、違規名單等）。
   - 保留「關鍵字搜尋」（多欄位模糊匹配名稱、地址、負責人、電話）。
3. **伺服器端分頁 (Server-side API Pagination)**：
   - 後端 API（`/api/facilities` 及主要資料端點）全面支援 `page`、`pageSize`（30/50/100）、`offset`、`county`、`district`、`keyword`、`sort`。
   - API 回傳 `{ items, total }`，使分頁器精確計算 `totalPages = Math.ceil(total / pageSize)`。
   - 前端藉由 `usePagination.ts` 與 URL Query Params (`?page=1&pageSize=30`) 雙向綁定，重新整理與網址分享皆能精確定位。
4. **地圖與分頁 1:1 連動與視角包夾 (FitBounds)**：
   - 地圖圖釘僅繪製「當前分頁的 30/50/100 筆」據點。
   - 翻頁時地圖平滑清空並載入新標記，並觸發 `map.fitBounds()` 自動最佳化視角，卡片與地圖圖釘精確 1-to-1 對應。
5. **全面體系升級**：
   - 通過升級 `FacilitySearchContent.tsx` 與 `/api/facilities`，一口氣全面升級 35+ 款地理地圖設施工具。
   - 同步對齊健康食品認證、藥品、食品業者、綠色商品、碳足跡、文化展演、公共藝術等主要獨立資料工具。

---

## 3. 架構設計與模組規劃

### 3.1 台灣行政區標準模組 (`lib/constants/taiwanDistricts.ts`)
- 統一收納台灣 22 縣市與 368 鄉鎮市區清單。
- 提供 `TAIWAN_COUNTIES`、`TAIWAN_COUNTY_DISTRICTS` 映射字典及各縣市中心座標。
- 提供輕量級連動選擇器元件 `<CountyDistrictPicker>`，具有乾淨深色模式支援與極簡設計。

### 3.2 後端設施查詢端點擴充 (`lib/server/facilities/queries.ts` & `/api/facilities`)
- 擴充 `FacilitySearchParams`：
  ```ts
  export interface FacilitySearchParams {
    facilityType: string;
    keyword?: string;
    county?: string;
    district?: string;
    lat?: number;
    lng?: number;
    radiusMeters?: number;
    limit?: number;
    offset?: number;
    serviceItem?: string;
    onlyCharity?: boolean;
    sort?: "distance" | "name" | "category" | "newest";
  }
  ```
- 擴充 `countFacilities(facilityType, filters)`：支援計算套用 `county`、`district`、`keyword`、`serviceItem` 篩選後的精確總筆數。
- 支援 `sort === "newest"`：`ORDER BY id DESC`（或 `updated_at DESC, id DESC`）。
- 支援離線種子回退（Fallback）之二級鄉鎮篩選與最新排序。

### 3.3 前端通用設施元件升級 (`components/Facilities/FacilitySearchContent.tsx`)
- 整合 `<CountyDistrictPicker>`，支援二級地區即時篩選。
- 整合 `sort` 切換器（距離最近、最新登記、名稱筆畫、業務分類）。
- 整合 `usePagination`，底端呈現標準 `Pagination` 元件（30 / 50 / 100 切換與分頁按鈕）。
- 翻頁時，地圖標記即時同步當前頁面資料並執行平滑 `fitBounds`。

### 3.4 獨立資料列表工具升級
- 對齊專門資料工具（如 `health-supplements`、`drugs`、`food-operators`、`green-products` 等），確保預設最新 30 筆，支援 30/50/100 Pager 與進階篩選。

---

## 4. 驗證與測試計畫

1. **靜態型別檢驗**：執行 `npm run typecheck`，確保 0 錯誤。
2. **單元測試驗證**：執行 `npm test`，確保既有 272 項測試持續 100% 通過，並增補行政區與分頁單元測試。
3. **全站健康度與各頁資料可用性審查**：
   - 擴充或執行審查腳本，對全站關鍵列表工具進行端對端資料回傳檢驗，確認：
     - 各頁面正常渲染（HTTP 200）。
     - 初始資料大於 0 筆（不出現空資料/白屏）。
     - 分頁器 (30 / 50 / 100) 功能運作正常。
     - 二級地區篩選生效。
