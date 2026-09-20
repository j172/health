# 刪除孤兒元件 NearbyWeatherBar.tsx

- **作者**：Claude（診斷會話）
- **日期**：2026-09-21
- **狀態**：Draft
- **對應使用者回報**：「1. 移除新聞卡的定位，新聞卡根本不需要定位位置，減少LOADING」

## 1. 診斷結果（已確認，請直接動手，不用重新調查）

使用者原本以為新聞卡片本身有地理定位邏輯、造成額外的 LOADING，因此想移除。實際調查發現：

- `components/News/NewsCard.tsx`、`HeroPost.tsx`、`HomeCategoryNewsSection.tsx`、`StabloNewsLayout.tsx`、`ThematicCover.tsx`、`CardThumb.tsx` 全部都**沒有**任何 `geolocation`/`getCurrentPosition`/`useGeolocation`/`navigator.geolocation` 相關程式碼，新聞卡從來就不會依賴使用者定位。
- 文章頁原本有一張會顯示 lat/lng 的地圖小卡片，已經在 commit `9d29b6b`（PR #344）移除，不用重複處理。
- 使用者實際感受到的 LOADING，來源是 `/news` 頁面旁邊 `NewsSidebar.tsx` 掛載的 `LocalWeatherSvgWidget`/`AqiSidebarWidget`/`UvSidebarWidget` 這幾個會呼叫 `useGeolocation()` 的獨立小工具，跟新聞卡片是不同元件、不同檔案。這部分已經拆到另一份規格 `docs/specs/sidebar-widgets-unified-error-state-refactor.md` 處理（含「載入失敗」明確提示，之後至少不會無限轉圈）。**本規格不需要重複處理定位/loading 行為，只負責下面這件事。**
- 調查中發現一個真正的孤兒檔案：`components/News/NearbyWeatherBar.tsx`（166 行），內部用 `useGeolocation()` 呼叫 `/api/weather-nearby`，渲染「附近測站」AQI/PM2.5/UV/降雨資訊列。全專案 `git grep -n "NearbyWeatherBar"` 除了它自己的 `export default function` 那一行之外，沒有任何其他檔案 import 它——目前沒有任何頁面在使用，是開發過程留下但沒接線的死檔案。

使用者確認：**只刪除這個孤兒死檔，NewsCard 上的「📍 縣市名」徽章（`item.location_name`，純伺服器端 DB 欄位，不是 GPS 定位、不影響載入速度）維持不動，`LocalWeatherSvgWidget` 也維持不動。**

## 2. 待辦事項

1. 刪除 `components/News/NearbyWeatherBar.tsx`。
2. 全域搜尋確認真的沒有任何地方 import 它（`git grep -rn "NearbyWeatherBar"`），刪除後應該只剩本規格文件裡的文字紀錄。
3. 確認刪除後 `npm run build`／型別檢查沒有因為少了這個檔案而出錯（理論上不會，因為沒有任何地方引用）。

## 3. 驗收標準

- `components/News/NearbyWeatherBar.tsx` 不存在。
- `git grep -rn "NearbyWeatherBar"` 除了本規格文件外沒有其他結果。
- `npm run build` 通過。
- 不改動 `NewsCard.tsx`、`LocalWeatherSvgWidget.tsx`、任何 SIDEBAR 小工具。
