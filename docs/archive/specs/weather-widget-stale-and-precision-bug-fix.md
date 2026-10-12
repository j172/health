# 「即時在地天氣」小工具：距離數字未格式化 + 從不自動刷新

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應使用者回報**：「2. 即時在地天氣資料一直沒有更新」（範例：32.3°C 多雲 臺北市信義區(信義)·距離約0.5422508098069995km）

## 1. 診斷結果（已確認兩個根因，請直接修，不用重新調查後端資料管線）

已排除的可能性：後端 `runCwaSync`（`lib/server/cron/registerJobs.ts` 註冊，每小時 :15/:45 執行）**運作正常**，SSH 到生產主機確認 `cwa_station_weather` 每次執行都有數百筆 insert/update，測站資料本身是活的、有在更新。問題出在前端：

1. **距離數字未格式化（對應使用者截圖的一長串小數）**：`components/Tools/LocalWeatherSvgWidget.tsx` 第 206 行左右：
   ```tsx
   {locationTitle} · 距離約 {weather.distance_km}km
   ```
   `distance_km` 是後端算出的原始浮點數，沒有 `.toFixed()`，所以會顯示出 `0.5422508098069995` 這種完整精度的小數。
2. **小工具從不自動刷新（對應「資料一直沒有更新」）**：同檔案內 `fetchWeather` 只在 `useEffect(() => { fetchWeather(geo.lat, geo.lng); }, [geo.lat, geo.lng, fetchWeather])` 觸發，也就是只有在使用者的地理座標第一次解析出來（或改變）時才抓一次資料，之後除非使用者手動按重新整理按鈕（`handleRefresh`），否則永遠不會再抓新資料。使用者若開著頁面沒有互動，畫面上的溫度/天氣描述會是「打開當下那一刻」的快照，久了自然感覺「資料一直沒有更新」——這不是後端資料真的沒更新，是前端沒有定期重抓。

## 2. 待辦事項

1. 修正距離顯示：`{weather.distance_km}km` 改為 `{weather.distance_km.toFixed(1)}km`（或依現有其他類似元件的慣例小數位數，例如 `NearbyRainfallCard`/`AedContent` 等處若已有一致的距離顯示格式，比照辦理以維持全站一致）。
2. 為 `LocalWeatherSvgWidget` 加上定期自動刷新（例如每 10~15 分鐘呼叫一次 `fetchWeather`，可用 `setInterval` 搭配 cleanup，或专案內若已有共用的 polling hook 慣例則優先重用），並在元件 unmount 時清除計時器避免記憶體洩漏。刷新間隔不需要比後端排程（每 30 分鐘）更頻繁，抓太密反而增加不必要的 API 呼叫。
3. 檢查同一支檔案（或其他也吃 `/api/weather-nearby` 回傳值的元件，例如 `components/News/NearbyWeatherBar.tsx`）是否有類似「只抓一次不刷新」的模式，若有，一併評估是否需要同樣的定期刷新（依各元件實際使用情境判斷是否必要，不必全部套用同一種做法）。

## 3. 驗收標準

- 距離顯示為固定小數位數（例如 `0.5km`），不再出現長串浮點數。
- 打開頁面後靜置一段時間（超過一次刷新間隔），畫面上的天氣資料會自動更新為最新值，不需要使用者手動按重新整理。
- `npm test` 通過；若有相關元件測試，一併更新。
