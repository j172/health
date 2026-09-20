# cwa_station_weather 重複 row 累積與查詢效能懸崖（待用 production DB 權限調查）

- **作者**：Claude（診斷會話）
- **日期**：2026-09-21
- **狀態**：Draft — 需要 production 資料庫唯讀存取權限才能繼續，本次診斷會話沒有該權限
- **前情**：`docs/specs/cwa-station-weather-obstime-update-fix.md`（issue #373 / PR #376）、後續 hotfix commit `e144a92`

## 1. 事件經過

PR #376 修正了 `upsertCwaStationWeather` 漏寫 `obs_time` 的 bug，並在 `getNearestStationWeather` 的 SQL 加上 `ORDER BY distance_km ASC, s.obs_time DESC` 這個第二排序鍵，理由是：`cwa_station_weather` 的 UNIQUE KEY 是 `(dataset_id, station_id, obs_time)`，每次同步遇到真正新的 `obs_time` 都會走 INSERT 分支（不是 UPDATE），所以同一個測站已經累積了大約 3 週、每次同步週期一筆的重複 row，全部共用同一組 lat/lng（因此 `distance_km` 完全相同）。沒有次要排序鍵時，`LIMIT 1` 在多筆同分 row 之間的 tie-break 行為不可控，這正是三個測站各自卡在不同「第一次寫入日期」的根因。

**PR #376 部署到 production 後，`/api/weather-nearby` 的 `stationWeather` 欄位在所有測試過的縣市、所有請求都變成 `null`**（原本至少會回傳資料，只是 `obs_time` 是舊的）。交叉比對同一時間窗口內 `/api/aqi/nearest`（查詢邏輯本次沒有改動）持續正常回傳資料，排除「host 層級不穩定」的可能性——問題明確集中在 `cwa_station_weather` 這張表本身的查詢。基於當下無法連線 production 資料庫確認真正原因（時間out?語法在特定資料量下的執行計畫退化?其他?），採取保守做法：**把 `ORDER BY` 改回 PR #376 之前的單一排序鍵**（commit `e144a92`），恢復成「資料存在但 `obs_time` 是舊的」這個已知穩定多週的狀態，止血後再另外調查。恢復後 hotfix 部署，確認 `stationWeather` 已經重新開始正常回傳。

**目前 `obs_time = VALUES(obs_time)` 的 UPDATE 子句修正仍然保留在 production**（無害，且對「同一 obs_time 重複同步」的情境仍然正確）；但 `ORDER BY` 已回退，代表**這張表卡在舊觀測時間的原始症狀目前又復發了**——這次 hotfix 只是把「完全沒資料」降級回「資料舊」，不是真正解決使用者回報的「天氣一直是舊資料」。

## 2. 需要用 production DB 唯讀存取才能確認的事

1. `SELECT COUNT(*) FROM cwa_station_weather;` 以及 `SELECT station_id, COUNT(*) FROM cwa_station_weather GROUP BY station_id ORDER BY COUNT(*) DESC LIMIT 10;` —— 確認「每個測站累積大量重複 row」的假設，量化到底多嚴重（預期：每個測站可能有數百到上千筆重複 row，全站可能數十萬筆）。
2. 對加了 `s.obs_time DESC` 的版本跑 `EXPLAIN`（或 production 環境下的 slow query log），確認是不是真的變成 full table scan + filesort 導致逾時，還是其他原因（例如連線池耗盡、記憶體不足被系統 OOM kill 等）。
3. 確認 `idx_cwa_station_weather_geo (lat, lng)` 這個既有索引在計算 `distance_km`（haversine 公式，非單純 lat/lng 相等比對）時實際上完全用不上（MySQL 無法用一般 B-Tree 索引加速這種計算式排序），這代表**只要表夠大，即使不加第二排序鍵，原本那條查詢本身遲早也會變慢**——`obs_time` 那個 bug 造成的表格膨脹本身就是效能風險，不是只有「顯示時間戳很舊」這個表面症狀。

## 3. 候選修法（需要人工決定要選哪個，或組合使用）

1. **定期清理重複 row**：加一個排程（或一次性清理 script），對每個 `(dataset_id, station_id)` 只保留 `obs_time` 最新的一筆，其餘刪除。最直接，但要小心大量 DELETE 對 production 的鎖定/效能影響，建議分批。
2. **改變 upsert 策略而非只補 UPDATE 子句**：與其讓 `obs_time` 留在 UNIQUE KEY 裡讓每次新觀測都 INSERT，改成 UNIQUE KEY 只用 `(dataset_id, station_id)`，`obs_time` 變成一般欄位、每次同步都是真正的 UPDATE（覆蓋舊觀測），從根本避免無限累積。這需要一次 `ALTER TABLE` migration（production 既有表要重建索引，且要先做過第 1 點的清理，否則 ALTER 會因為現有重複資料違反新 UNIQUE KEY 而失敗），風險與清理量成正比，需要在維護時段執行並先備份。
3. **查詢面改用視窗函式先篩最新 row 再算距離**（`ROW_NUMBER() OVER (PARTITION BY station_id ORDER BY obs_time DESC)`，本專案 `lib/server/cwa/queries.ts` 其他函式已有先例）——如果第 2 點的 schema 改動風險太高、暫不執行，至少查詢本身要先篩掉重複再算距離，而不是對整張膨脹的表逐 row 算 haversine 再排序。但這個做法本身也需要先掃過全表算 ROW_NUMBER，如果表已經膨脹到數十萬筆，效能上限還是取決於第 1 點有沒有做清理。

**建議順序**：先做第 1 點（清理歷史重複資料，止血效能問題），視情況決定要不要做第 2 點（改 schema 根治），第 3 點是查詢寫法層面的加強，可以搭配前兩者一起做，但單獨做效果有限。

## 4. 待辦事項

1. 取得 production 資料庫唯讀存取權限（或請有權限的人代為執行第 2 節列的唯讀確認查詢），量化重複 row 規模。
2. 根據量化結果，在本規格第 3 節列出的候選修法中選擇（或請使用者決定），寫成正式的實作規格。
3. 修好之後，比照這次的教訓——**部署後務必用 production API 實際打幾次，跨多個地點驗證，不能只憑 `npm test`/本地驗證就視為完成**，才能關閉「天氣一直是舊資料」這個使用者原始回報。

## 5. 驗收標準（等第 3 節選定修法後才能真正驗收，這裡先列最終使用者可感受到的目標）

- `/api/weather-nearby` 的 `stationWeather.obs_time` 會隨著背後 CWA 每小時 `:15`/`:45` 的同步持續前進，不再永遠凍結在某個歷史日期。
- 部署後用至少 3 個不同縣市的座標打正式站 API 驗證，確認沒有 `stationWeather: null` 的 regression 重演。
- `cwa_station_weather` 的 row 數量維持在合理範圍（不再隨時間無限成長）。
