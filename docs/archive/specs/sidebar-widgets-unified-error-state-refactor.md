# Sidebar 小工具統一 fetch/錯誤處理重構

- **作者**：Claude（診斷會話）
- **日期**：2026-09-21
- **狀態**：Draft
- **對應使用者回報**：「2. 右邊的SIDEBAR有時候有資料有時候沒有」
- **前情**：Issue #343 / PR #349（2026-09-20）已修過一次，但範圍只涵蓋 `CdcAlertSidebarWidget`/`WaterOutageSidebarWidget` 兩個小工具的特定 bug。使用者今天（2026-09-21）仍持續回報同樣症狀，重新調查後確認根因沒有被完全解決，且找到一個當時沒被發現的新 bug。這次使用者已明確決定要做**全面統一重構**（而不是延續 #349 那種「只修有問題的個別 widget」的最小改動路線），請照本規格的範圍執行，不用再回頭問要不要縮小範圍。

## 1. 已知背景（先讀，避免重複調查）

`components/News/NewsSidebar.tsx`（第 36-143 行）組合了 10 個獨立元件：`LocalWeatherSvgWidget`、`WeatherAlertSidebarWidget`、`ErStatusSidebarWidget`、`EarthquakeSidebarWidget`、`AqiSidebarWidget`、`UvSidebarWidget`、`CpcPriceSidebarWidget`、`WaterOutageSidebarWidget`、`CdcAlertSidebarWidget`、`PestAlertSidebarWidget`，加上一個外部傳入 props 的「熱門新聞」區塊。

**沒有共用的資料抓取 hook**——只有 Aqi/Uv 共用 `useNearestStation.ts` + `SidebarWidgetShell.tsx`，其餘每個都自己刻一份 `useEffect`/`fetch`/`useState`。這個不一致本身就是「時好時壞」體感的主因之一。

### 已確認的具體問題（逐一列出，實作時不用重新排查，直接處理）

1. **系統性問題（影響全部 10 個小工具）**：`components/Tools/SidebarWidgetShell.tsx`（第 65-73 行）目前只支援 `showSpinner`/`hasData`/空狀態文字，**沒有獨立於「空」之外的「錯誤」狀態**。任何 fetch 失敗（timeout、500、網路斷線）目前都會收斂成跟「今天真的沒有資料」一模一樣的畫面（例如「暫無急診通報資料」），只在 console.warn 留下診斷線索，使用者/開發者都無法分辨。不共用 `SidebarWidgetShell` 的小工具（Cdc/Water/Er/Pest/Cpc）也有一樣的問題，各自的空狀態文字都沒有區分「抓取失敗」跟「真的沒有」。
2. **`useNearestStation.ts`（第 32-53 行）的 refresh 失敗會洗掉已知正確資料**：最近測站查詢（timeout、網路錯誤、或非 2xx）失敗時，程式碼無條件執行 `setResolved({ lat, lng, station: null })`，即使是在「重新整理」情境、先前已經成功抓到測站，也會被直接覆蓋成 `null`，沒有「保留上一次成功結果」的分支。這是 #349 那次審查沒有涵蓋到的、目前唯一已知的**真實資料遺失型**迴歸。
3. **`AqiSidebarWidget`/`UvSidebarWidget` 用假資料掩蓋失敗**：因為 `station ?? fallbackStation` 加上永遠傳 `hasData={true}` 給 `SidebarWidgetShell`，即使抓取失敗也不會顯示殼元件的空狀態，而是靜默降級成寫死的預設城市假資料（例如台北 AQI 35「良好」），沒有任何錯誤/過時提示，使用者看到的是「資料錯誤但看起來正常」而不是「沒資料」。
4. **`app/api/aqi/nearest/route.ts`（第 22-50 行）把資料庫錯誤偽裝成正常回應**：DB 查詢例外被 catch 後回傳 HTTP 200 `{ station: null }`，跟「附近真的沒有測站」在 HTTP 層級完全無法區分，前端無從得知這是後端錯誤還是正常的空結果。
5. **`ErStatusSidebarWidget`/`PestAlertSidebarWidget`/`CpcPriceSidebarWidget`** 已經各自用同一個 fetch function 處理 mount + refresh（不會踩 #349 那個「refresh 用不同、沒檢查 `res.ok` 的路徑」的坑），但三者都沒有 `isMounted` guard、也沒有用 `fetchWithTimeout`，抓取卡住時 spinner 會一直轉、卸載元件後 setState 也可能觸發 React warning。
6. **`EarthquakeSidebarWidget`/`WeatherAlertSidebarWidget`** 是純展示元件，資料由頁面端 server-side props 傳入，不是 client fetch race，emptiness 若有問題根因在 server 端 query，不在這兩個元件本身，本次重構不用動它們的資料來源邏輯（除非要順便套用一致的視覺殼）。
7. **`LocalWeatherSvgWidget.tsx`（第 130-161 行）** 已經有 `fetchWithTimeout`、10 分鐘定時刷新（PR #345）、失敗時保留上一次成功值——這部分做法基本正確，缺的只是「資料可能已過期」的視覺提示，可以當作其他 widget 抓取失敗時「保留舊資料」的參考範例（如果本次決定的策略是保留舊資料而非清空）。

### 這次使用者確認的處理方式

- **範圍**：10 個小工具全部改用統一的共用 fetch/錯誤處理邏輯（不是只修「確認重現有問題」的個別 widget）。
- **錯誤狀態 UX**：抓取失敗時，`SidebarWidgetShell`（以及其餘沒共用它的小工具）要顯示**明確的小圖示 + 文字**（例如一個網路/警示圖示 + 「載入失敗，點擊重試」），跟「今天真的沒有資料」的空狀態視覺上明確區分，不能長得一樣。

## 2. 待辦事項

1. 設計一個共用的 sidebar fetch hook（例如 `useSidebarWidgetData` 之類的命名，實際命名/介面由實作時決定，只要全部 10 個小工具改用同一套），至少要處理：
   - `fetchWithTimeout` 包裝（全部小工具統一有 timeout，不再是只有部分有）。
   - 區分三種狀態：`loading` / `error`（抓取失敗，不管是 timeout、非 2xx、網路錯誤）/ `success`（含資料，即使資料是空陣列也算 success，因為那才是「真的沒有」）。
   - `isMounted` guard（避免卸載後 setState）。
   - 手動重試（重新整理按鈕）與自動 mount 抓取共用同一條路徑，不要像 #349 修之前那樣各自為政。
2. 更新 `SidebarWidgetShell.tsx`，新增第三種視覺狀態（錯誤：小圖示 + 文字 + 可重試），跟現有的 loading/空資料狀態並列。
3. 把 10 個小工具（`LocalWeatherSvgWidget`、`WeatherAlertSidebarWidget`、`ErStatusSidebarWidget`、`EarthquakeSidebarWidget`、`AqiSidebarWidget`、`UvSidebarWidget`、`CpcPriceSidebarWidget`、`WaterOutageSidebarWidget`、`CdcAlertSidebarWidget`、`PestAlertSidebarWidget`）改用新的共用 hook + 新的錯誤狀態。`EarthquakeSidebarWidget`/`WeatherAlertSidebarWidget` 若本來就是 server props 而非 client fetch，只需要套用一致的視覺殼，不用勉強塞進 fetch hook。
4. 修正 `useNearestStation.ts` 第 32-53 行：refresh 失敗時保留上一次成功的 `station`，不要無條件 `setResolved({ lat, lng, station: null })`，並回傳/暴露一個「這次抓取失敗」的旗標讓 `AqiSidebarWidget`/`UvSidebarWidget` 可以顯示錯誤狀態而不是靜默用假資料掩蓋。
5. 修正 `AqiSidebarWidget`/`UvSidebarWidget`：拿掉「永遠 `hasData={true}`」的寫法，改成真正依照上面新旗標決定要顯示成功資料、錯誤狀態、還是空狀態三者之一。
6. 修正 `app/api/aqi/nearest/route.ts`：資料庫查詢失敗時回傳 5xx 而不是 200 `{station:null}`，跟 `app/api/water-outages/route.ts`/`app/api/cdc/travel-alerts/route.ts` 現有的正確模式保持一致。
7. 幫 `ErStatusSidebarWidget`/`PestAlertSidebarWidget`/`CpcPriceSidebarWidget` 補上 `isMounted` guard（若改用共用 hook 這步會自動涵蓋，不用額外手動處理）。

## 3. 驗收標準

- 10 個小工具都改用同一套共用 fetch/錯誤處理邏輯（或有明確理由說明為何某個維持特例，例如純 server props 的元件）。
- 任何一個小工具在抓取失敗時，畫面上會出現「載入失敗」的小圖示 + 文字，且視覺上明顯不同於「真的沒有資料」的空狀態。
- 模擬 `useNearestStation` 重新整理失敗（例如暫時讓 `/api/aqi/nearest` 回傳錯誤）時，畫面不會把已經成功顯示的測站資料洗掉，而是顯示錯誤狀態並保留（或明確標示過期）上一次的資料。
- `app/api/aqi/nearest/route.ts` 資料庫錯誤情境下回傳非 2xx 狀態碼。
- `npm test` 通過；若有相關元件測試，一併新增/更新（至少涵蓋新的錯誤狀態渲染、`useNearestStation` 的保留舊資料邏輯）。
- PR 說明列出 10 個小工具各自的改動摘要，方便人工複核涵蓋範圍。
