# 為 /tools/inundation-map 建立真正的地圖功能

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應診斷**：`docs/specs/map-technology-findings.md`（全站地圖技術盤點）
- **已與使用者確認**：這是新功能開發（不是單純 bug 修復），使用者選擇直接把地圖建起來，而不是只改標題文案。

## 1. 背景

`app/tools/inundation-map`（`components/Tools/InundationMapContent.tsx`，約 480 行）標榜「全台積淹水即時感測地圖」，頁面標題與敘述都在講「地圖」，但目前完全沒有任何地圖渲染程式碼（無 Leaflet/SVG/Canvas/iframe），只有：
- 縣市篩選按鈕列
- 感測站列表卡片（`data.sensors`，含 `lat`/`lng`/`waterDepthCm`/`alertLevel`）
- 河川水位警戒站列表卡片（`data.riverAlerts`，含 `currentWaterLevel`/`alertLevel`）
- 避難收容處所列表卡片（`data.shelters`，含 `lat`/`lng`/`capacity`）

三種資料都已經有經緯度（除了河川水位站目前列表卡片沒顯示座標，需確認 `RiverWaterLevelAlert` 型別是否已有 `lat`/`lng`，若無則只在地圖上標示有座標的兩類，河川站維持列表呈現)，`/api/inundation-map` 已經回傳這些資料，只是從未被畫成地圖。

## 2. 待辦事項

1. 依全站既有慣例（`react-leaflet` + `leaflet`，OSM tile，`components/Common/MapViewController.tsx` 共用控制器），在既有的列表卡片**之上**（不是取代，列表卡片對行動裝置/可及性仍有價值）新增一個互動地圖區塊，可參考 `components/WaterOutages/WaterOutagesLeaflet.tsx`（本次批次的另一張票會先把它改用共用控制器，可直接參考修好後的版本）作為結構範例。
2. 地圖上至少要能標示：
   - 路面淹水感測站（`data.sensors`），依 `alertLevel`（normal/warning/critical）用不同顏色/圖示標記，點擊顯示測站名稱、即時水深、警戒門檻等既有列表卡片上的資訊（可重用同一份資料，不用另外呼叫 API）。
   - 避難收容處所（`data.shelters`），標記名稱、容量、聯絡電話。
   - 若 `RiverWaterLevelAlert` 型別已有座標欄位，一併標示河川水位警戒站；若沒有，這部分維持現狀（列表卡片），不要為了畫地圖去新增後端欄位，超出本工單範圍。
3. 地圖應該要能響應現有的篩選狀態（`selectedCounty`、`onlyAlert`）——篩選後地圖上顯示的標記應該與下方列表卡片一致，不要地圖跟列表各自獨立、篩選後不同步。
4. 沿用既有的 `useGeolocation()`／`MapLocationBanner` 邏輯決定地圖預設中心點與 zoom（使用者座標可用時置中在使用者附近，否則用全台縣市中心或既有 fallback 資料的邏輯）。
5. 效能考量：若感測站/避難所數量較多，考慮使用既有元件裡已經用過的 marker clustering 或類似機制（若全站其他地圖元件已有解法，直接沿用；若沒有，本工單目前的資料量級不需要額外引入新的 clustering 套件，簡單渲染即可，不要過度工程化）。

## 3. 驗收標準

- `/tools/inundation-map` 頁面新增一個可互動的地圖區塊，正確標示感測站與避難所位置與狀態。
- 地圖與既有的縣市篩選、「只看警戒點」篩選連動一致。
- 手機版面下地圖不破版（比照全站其他地圖元件的 RWD 處理方式）。
- `npm test`／`npm run build` 通過。
