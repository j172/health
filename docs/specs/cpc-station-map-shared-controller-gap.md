# Fix: CpcStationMap 未接上全站共用的 MapViewController

- **Type**: Bug fix / consistency gap. No new feature.
- **Affects**: `components/Tools/CpcStationMap.tsx`
- **Related**: `components/Common/MapViewController.tsx` (PR #245, closes #244, 2026-09-13 已上線)

## 1. 背景

2026-09-13 的 PR #245 把 5 個地圖元件（哺集乳室、事後避孕藥、文化資產、防災地圖、機構公設地圖）
統一升級到 `components/Common/MapViewController.tsx`：共用的 `flyTo` 平滑視角動畫 + 統一的
`userLocationIcon` 定位標記樣式。

在那之後合併的 PR #247（中油油氣牌價與站點地圖）新增了 `components/Tools/CpcStationMap.tsx`，
同樣是 react-leaflet `MapContainer`，卻是獨立實作、沒有接上 `MapViewController`：

- 檔案內自己重新寫了一個 `MapController`（`CpcStationMap.tsx:18-24`），用 `map.setView()`
  瞬間跳轉，而不是 `MapViewController` 的 `map.flyTo(..., { duration: 1.2 })` 平滑動畫。
- `userLocationIcon` 本身有正確從 `@/components/Common/MapViewController` import
  （`CpcStationMap.tsx:7`），只有「視角控制」這一半沒接上共用元件，定位標記樣式沒問題。

上層的 `components/Tools/CpcStationsClient.tsx` 已經正確使用 `useGeolocation()`
（`CpcStationsClient.tsx:5,40`），所以「先定位、拒絕才退回台北101」這條全站規則本身**沒有破**
——純粹是地圖切換站點/更新使用者位置時，少了跟其他 5 個地圖一致的平滑過場動畫，體驗不一致。

## 2. 修法

1. 刪掉 `CpcStationMap.tsx` 內自己重寫的 `MapController` function（18-24 行）。
2. 改為 `import MapViewController from "@/components/Common/MapViewController"`，
   在 `<MapContainer>` 裡把 `<MapController center={center} />` 換成
   `<MapViewController center={center} zoom={13} />`，做法比照 `HeritageMapLeaflet.tsx:110`。
3. 確認拿掉 `useMap` 這個現在用不到的 import（若沒有其他地方使用）。

## 3. 順便掃描：全站是否還有其他地圖沒接上共用元件

已核對現況（2026-09-14）：全站含 `MapContainer` 的元件共 7 個——
`CpcStationMap.tsx`（本張要修的）、`HeritageMapLeaflet.tsx`、`FacilityMap.tsx`、
`DisasterMapLeaflet.tsx`、`ContraceptionMapLeaflet.tsx`、`BreastfeedingMapLeaflet.tsx`
都已使用 `MapViewController`；`MapViewController.tsx` 本身不計。**目前只有這一個缺口**。

實作時仍建議跑一次 `grep -rn "MapContainer" components/` 做最終確認，避免這份 spec
寫完到實際動工之間又有新地圖元件加入而漏掉。

## 4. 驗收

- 中油站點地圖切換選取站點、或使用者定位更新時，視角改為平滑 `flyTo` 動畫，跟其他 5 個地圖一致。
- `npm run build`／既有測試維持通過。
- 不新增任何新的定位邏輯、不改動 `useGeolocation.ts`。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
