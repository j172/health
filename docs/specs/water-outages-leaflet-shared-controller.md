# WaterOutagesLeaflet 改用共用的 MapViewController

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應診斷**：`docs/specs/map-technology-findings.md`（全站地圖技術盤點）

## 1. 背景

全站地圖技術盤點發現：8 個實際渲染地圖的元件都是 `react-leaflet` + `leaflet`，技術一致，唯一的落差是 `components/WaterOutages/WaterOutagesLeaflet.tsx` 自己重新實作了一份 `MapViewController`（第 44 行起的本地函式）與 `userLocationIcon`（第 36 行），而不是像其他 7 個元件一樣共用 `components/Common/MapViewController.tsx`（同樣輸出 `MapViewController` 元件與 `userLocationIcon`）。

## 2. 待辦事項

1. 刪除 `WaterOutagesLeaflet.tsx` 內本地重複定義的 `MapViewController` 函式與 `userLocationIcon`。
2. 改為 `import MapViewController, { userLocationIcon } from "@/components/Common/MapViewController"`（實際 import 路徑與命名以該檔案現況為準）。
3. 確認共用版本的 `MapViewController`（接受 `center`/`zoom` 這兩個 prop）與 `WaterOutagesLeaflet.tsx` 原本呼叫本地版本時傳入的參數相容；若有行為差異（例如動畫時長、預設 zoom），以共用版本為準，不要為了遷就舊行為又在共用元件上加參數分岔。
4. 視覺與互動行為（地圖飛到使用者位置的動畫、使用者定位藍點樣式）應與遷移前一致，這是純內部重構，不是功能變更。

## 3. 驗收標準

- `/tools/water-outages` 頁面地圖功能（飛到指定座標、使用者定位藍點）行為與修改前一致。
- `WaterOutagesLeaflet.tsx` 不再包含重複定義的 `MapViewController`/`userLocationIcon`。
- `npm test`／`npm run build` 通過。
