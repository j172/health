# 12 前端穩定性與側欄小工具

> 合併自 9 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代

---

## 1. 目前真相

- 首頁／新聞側欄 10 個小工具：在地天氣、氣象警報、急診、地震、AQI、UV、油價、停水、CDC、病蟲害。
- 共用資料抓取 hook `useSidebarWidgetData.ts`＋外框 `SidebarWidgetShell.tsx`：統一的載入、逾時、錯誤狀態（「載入失敗」明確提示，不會無限轉圈）。
- 在地天氣小工具定期自動刷新，距離顯示到小數點一位。
- 偵測 LINE／Facebook／Instagram／微信的 App 內建瀏覽器，顯示可關閉的「用外部瀏覽器開啟」橫幅（`InAppBrowserBanner`）。
- 語系與定位等讀取 `localStorage` 的狀態，一律在 hydration 之後才套用，避免 React #418。

---

## 2. 長期有效的決策

- 新聞卡片從來不需要使用者定位；造成 loading 的是側欄的定位類小工具。
- 側欄採**全面統一重構**（使用者決定），不再逐個小工具修補。
- `useEffect` 內不得同步呼叫 `setState`、render 中不得呼叫 `Date.now()` 等不純函式（React 19 規則）。

---

## 3. 核對後仍未完成的項目

已併入 2.0：10 個小工具各自打 API（首頁 10 個請求）→ 合併為 1 支 snapshot API。

---

## 4. 逐份紀錄

#### React #418、cron 記憶體防護、靜態 manifest ✅
- 原檔：[fix-hydration-418-cron-memory-guard-and-static-manifest.md](../archive/specs/fix-hydration-418-cron-memory-guard-and-static-manifest.md)（#418、PR #408）
- `LanguageProvider` 的 `useSyncExternalStore` 伺服器端快照與客戶端不同；cron 記憶體吃緊時降載；`manifest.webmanifest` 改靜態讀取。

#### React #418、外部圖片 500、側欄 API 逾時 ✅
- 原檔：[fix-hydration-418-external-image-500-and-api-timeouts.md](../archive/specs/fix-hydration-418-external-image-500-and-api-timeouts.md)（PR #410）
- `useGeolocation` 與在地天氣在 `useState` 初始化時讀 `localStorage`；`toTaipei()` 的日期格式在兩端可能不同。

#### React 19 Hook 規範＋手動 RSS 同步非同步化 ✅
- 原檔：[react-19-hooks-and-manual-rss-sync-resilience.md](../archive/specs/react-19-hooks-and-manual-rss-sync-resilience.md)（#288）
- 修 6 個元件 8 項 lint 錯誤；`rss-sync-manual.yml` 因同步執行太久回 Empty reply，改為非同步觸發。

#### 修正 4 個 set-state-in-effect lint 錯誤 ✅
- 原檔：[set-state-in-effect-fix.md](../archive/specs/set-state-in-effect-fix.md)（#121、#122）
- 藥品、環保產品、藝文活動、公共藝術 4 個元件相同模式；GoogleTag 的警告另案處理。

#### 側欄有時沒有資料 ✅
- 原檔：[sidebar-intermittent-empty-data-fix.md](../archive/specs/sidebar-intermittent-empty-data-fix.md)（#343、PR #349）
- 先確認定位逾時修正（PR #174）是否涵蓋所有側欄路徑；修 CDC 與停水小工具。

#### 側欄小工具統一 fetch／錯誤處理重構 ✅
- 原檔：[sidebar-widgets-unified-error-state-refactor.md](../archive/specs/sidebar-widgets-unified-error-state-refactor.md)（PR #377）
- #349 只修兩個小工具，症狀持續；10 個小工具全部改用共用 hook，取代 #349 的局部修補。

#### 在地天氣：距離未格式化＋從不自動刷新 ✅
- 原檔：[weather-widget-stale-and-precision-bug-fix.md](../archive/specs/weather-widget-stale-and-precision-bug-fix.md)（PR #345）
- 顯示「0.5422508098069995km」；只在座標變化時抓一次。後端資料其實是活的（真正的後端 bug 見 [09](09-database-data-integrity.md) obs_time）。

#### 刪除孤兒元件 NearbyWeatherBar ✅
- 原檔：[remove-orphaned-nearbyweatherbar.md](../archive/specs/remove-orphaned-nearbyweatherbar.md)（PR #344 後續）
- 166 行、全專案無引用。

#### App 內建瀏覽器警告橫幅 ✅
- 原檔：[in-app-browser-warning-banner.md](../archive/specs/in-app-browser-warning-banner.md)
- UA 偵測 `Line/`、`FBAN`／`FBAV`、`Instagram`、`MicroMessenger`；關閉後以 `localStorage` 記住（`lib/client/inAppBrowser.ts` 含測試）。
