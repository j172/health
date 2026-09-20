# cwa_station_weather：UNIQUE KEY 拿掉 obs_time,從根本避免重複列再累積

- **作者**：Claude（診斷會話）
- **日期**：2026-09-21
- **狀態**：Draft — 未執行,等排定維護時段
- **前情**：`docs/specs/cwa-station-weather-obstime-update-fix.md`（issue #373 / PR #376 / hotfix `e144a92`)、`docs/specs/cwa-station-weather-duplicate-row-cleanup.md`（issue #378,候選修法第 2 點)、清理執行記錄（issue #378 留言,commit `ecc806d`)

## 1. 現況與為什麼還需要這份 migration

2026-09-21 稍早,`cwa_station_weather` 因為 UNIQUE KEY 是 `(dataset_id, station_id, obs_time)`,每次同步遇到新的 obs_time 都會走 INSERT 分支,53 天累積到 **1,856,771 筆**,導致 `getNearestStationWeather` 的 haversine 距離查詢（無法用索引加速排序）全表掃描 + filesort,拖垮了所有走同一條 DB 連線路徑的 API,造成當天的全站 `/api/*` 中斷。已用 `scripts/cleanup-cwa-station-weather-duplicates.mjs`（commit `ecc806d`)清成 1,239 筆（每個 `(dataset_id, station_id)` 只留最新一筆),止血。

**但這只是清了現有的重複列,沒有改變會繼續累積的原因。** Schema 沒變,`upsertCwaStationWeather`（`lib/server/cwa/queries.ts:262-316`)每次同步遇到新 obs_time 還是會 INSERT 新列,而不是 UPDATE 既有列。CWA 每小時 `:15`/`:45` 同步兩次,長期下去這張表會用跟這次一樣的速度重新膨脹,幾週後同一個效能懸崖會再發生一次——只是清理腳本已經寫好,下次可以直接重跑,不用重新診斷。這份 spec 是候選修法第 2 點：把 UNIQUE KEY 改成只有 `(dataset_id, station_id)`,讓同步變成真正的 UPDATE、從根本停止累積。

## 2. 提案

### 2.1 Schema 變更

```sql
-- migrations/20260921_cwa_station_weather_narrow_unique_key.sql
--
-- 前置條件：cwa_station_weather 此時必須已經是「每個 (dataset_id, station_id)
-- 只有一筆」的乾淨狀態（2026-09-21 的清理已經做到,但如果這份 migration
-- 延後執行,先重跑 scripts/cleanup-cwa-station-weather-duplicates.mjs --execute
-- 確認乾淨,否則下面的 ALTER TABLE 會因為現有重複資料違反新 UNIQUE KEY 而失敗）。

ALTER TABLE cwa_station_weather
  DROP INDEX uq_cwa_station_weather,
  ADD UNIQUE KEY uq_cwa_station_weather (dataset_id, station_id);
```

`obs_time` 保留一般欄位,不再是 key 的一部分——語意從「每個測站的每一次觀測都是一筆歷史紀錄」改成「每個測站目前最新一筆觀測」，這正是這張表實際被使用的方式（`getNearestStationWeather` 只取最新一筆,從來沒有查詢過歷史觀測)。

### 2.2 程式碼變更

`lib/server/cwa/queries.ts` 完全不用改——`upsertCwaStationWeather` 現有的 `ON DUPLICATE KEY UPDATE` 子句已經包含 `obs_time = VALUES(obs_time)`（PR #376 修的那行),UNIQUE KEY 一改窄,同一個 `(dataset_id, station_id)` 下次同步遇到新 obs_time 就會自動走 UPDATE 分支覆蓋舊列,不會再 INSERT 新列。

`getNearestStationWeather`（同檔案 350-397 行)目前有一段 2026-09-21 加的 `TEMPORARY REVERT` 註解,說明拿掉了 `s.obs_time DESC` 這個 tie-break 排序鍵。Schema 改窄之後每個 `(dataset_id, station_id)` 只會有一筆,`ORDER BY distance_km ASC LIMIT 1` 不會再有同分 tie 需要 tie-break（因為每個測站只剩一筆,不會有「同一測站好幾筆 distance_km 相同」的情況),**這段註解跟它描述的風險可以一併刪除**,查詢邏輯維持原樣即可,不需要重新加回 `s.obs_time DESC`。

### 2.3 執行步驟（維護時段執行,建議離峰時段、避開 CWA 同步的 `:15`/`:45`)

1. 執行前先重新確認乾淨：`node scripts/cleanup-cwa-station-weather-duplicates.mjs`（dry-run),確認 `toDelete` 是 0 或很小的數字（如果不是 0,先 `--execute` 清一次)。
2. SSH 進主機,對 `cwa_station_weather` 執行 2.1 的 `ALTER TABLE`（表現在只有約 1,200 多筆,`ALTER TABLE` 應該是秒級操作,不需要像清理腳本那樣分批)。
3. 拿掉 `lib/server/cwa/queries.ts` 裡的 `TEMPORARY REVERT` 註解區塊（約 332-349 行,`getNearestStationWeather` 函式定義前的 JSDoc 註解)。
4. 部署,用至少 3 個不同縣市的座標打 `/api/weather-nearby` 驗證回應正常、`stationWeather` 不是 `null`。
5. 觀察下一次（或下下次)CWA 同步（`:15`/`:45`)後,同一批座標再打一次,確認 `obs_time` 有前進、`cwa_station_weather` 總列數沒有變多（用 `SELECT COUNT(*) FROM cwa_station_weather;`,應該穩定在測站數量附近,不會逐次同步遞增)。

### 2.4 風險與回滾

- **風險**：`ALTER TABLE ... DROP INDEX ... ADD UNIQUE KEY` 如果執行當下表裡還有重複的 `(dataset_id, station_id)` 組合,會直接失敗（不會半途破壞資料),所以第一步的「重新確認乾淨」是安全網,不是形式。
- **回滾**：如果部署後發現問題,`ALTER TABLE cwa_station_weather DROP INDEX uq_cwa_station_weather, ADD UNIQUE KEY uq_cwa_station_weather (dataset_id, station_id, obs_time)` 可以改回原本的三欄位 key——但這樣做只是恢復「會再累積重複列」的舊行為,不是真正的回滾解法,只在改壞了什麼且需要立刻止血時使用。
- 備份表 `cwa_station_weather_backup_20260920`（2026-09-21 清理時建立,含清理前的完整 1,856,771 筆歷史觀測)目前還留在主機上,這次 migration 不會動到它。

## 3. 驗收標準

- `SHOW CREATE TABLE cwa_station_weather` 顯示 `UNIQUE KEY uq_cwa_station_weather (dataset_id, station_id)`,不再包含 `obs_time`。
- `lib/server/cwa/queries.ts` 裡 2026-09-21 加的 `TEMPORARY REVERT` 註解已移除。
- 部署後至少 3 個不同縣市驗證 `/api/weather-nearby` 正常回傳、`obs_time` 隨後續同步前進。
- 觀察至少 24 小時（涵蓋約 48 次同步周期),確認 `cwa_station_weather` 總列數沒有隨時間增加（穩定在測站數量 ×資料集數量附近,目前約 1,239)。
