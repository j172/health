# 中油站點資料補充：接入 getStationInfo（燃油種類/付款方式/總營業時間）

- **Type**: Data enrichment，擴充既有工具，非新工具。
- **Affects**: `scripts/import-cpc-stations.mjs`（或新增一個補充匯入腳本）、
  `lib/server/cpc/stations.ts`、`components/Tools/CpcStationsClient.tsx`、
  `components/Tools/CpcStationMap.tsx`（若要加篩選 UI）
- **來源**：使用者提供 `https://vipmbr.cpc.com.tw/openData/getStationInfo`（會 301 到
  `https://vipmbr.cpc.com.tw/opendata/getstationinfo`，已實測回傳可用 JSON）

## 1. 背景

`scripts/import-cpc-stations.mjs` 目前從 **十幾個各自獨立的服務類型端點**（充換電、洗車、
悠遊卡加值、加水、代收停車費、etag、真空機、廢油回收…）分別抓資料，再用 `stationCode` 合併。

使用者提供的 `getStationInfo` 端點是**另一個單一、已包含全部站點基本資料的端點**，實測回傳
每站的：
- 油品種類供應旗標：`無鉛92`、`無鉛95`、`無鉛98`、`酒精汽油`、`煤油`、`超柴`
- 付款方式旗標：`會員卡`、`刷卡自助`、`電子發票`、`悠遊卡`、`一卡通`、`HappyCash`、
  `自助柴油站`
- `營業時間`（總體營業時間，不是個別服務的時段）
- `洗車類別`、`etag申裝儲值時間`、`保養間時間`

這些欄位（尤其油品種類、付款方式、總營業時間）**目前完全沒有被匯入**——現有 pipeline 專注在
「有哪些加值服務」，沒有「賣哪些油、收哪些付款方式」這塊，是既有 `cpc-stations` 工具的資料
缺口，不是要做新工具。

## 2. 修法

1. 讀取現有 `scripts/import-cpc-stations.mjs` 的合併邏輯（用 `stationCode` 對齊多個來源），
   比照同樣的模式，新增 `getStationInfo` 作為一個新的資料來源，把上述欄位（油品種類、付款方式、
   總營業時間）合併進同一個 `extra_json` 結構裡。
2. 確認 `getStationInfo` 的「站代號」欄位格式跟現有其他來源的 `stationCode` 是否一致可以直接
   join（若格式不同需要轉換，實作前先比對兩邊幾筆資料的站代號格式）。
3. 更新 `lib/server/cpc/stations.ts` 的型別定義，把新欄位加進 `CpcStationItem`（或其
   `extra_json` 的型別）。
4. 前端（`CpcStationsClient.tsx`／`CpcStationMap.tsx` 的 Popup）視情況加上「供應油品」「付款
   方式」的顯示，若使用者體驗上合理，也可以加上依油品種類（例如「只看有 98 無鉛的站」）的篩選
   功能——這部分屬於加分項，先確保資料正確匯入是主要目標，篩選 UI 若時間允許再做。
5. 更新對應的匯入排程（若這個新來源需要獨立跑，或併入現有 `import-cpc-stations.mjs` 的排程即可，
   自行判斷，不需要新增額外的 GitHub Actions workflow，除非現有排程頻率明顯不適合）。

## 3. 驗收

- `getStationInfo` 的油品/付款/營業時間資料正確合併進現有站點資料，不重複、不遺漏。
- 既有測試與 `npm run build` 維持通過。
- 不影響現有已上線的加值服務資料（洗車、充換電等）。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
