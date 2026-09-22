# cwa_rainfall：UNIQUE KEY 縮窄，比照 cwa_station_weather

- **作者**：Claude（診斷會話）
- **日期**：2026-09-22
- **狀態**：Draft → 已執行（見底部執行紀錄）
- **前情**：`docs/specs/cwa-station-weather-narrow-unique-key-migration.md`（issue #379，已執行）、`docs/specs/cwa-rainfall-duplicate-row-cleanup.md`（issue #381，清理腳本已完成）

## 1. 為什麼現在補做

2026-09-21 的 `/grill` 盤點已經確認 `cwa_rainfall` 跟 `cwa_station_weather` 是同一種病根（UNIQUE KEY 含 `obs_time`，每次同步 INSERT 新列），並且決定要「開獨立新 issue 追蹤 schema 修法」——但當時只實際開了清理腳本的 issue #381，schema 縮窄本身沒有真的開 issue 也沒排時程，是遺漏的步驟。

2026-09-22 重新檢查：清理後（issue #381 執行時）只剩 1,360 筆，**一天內就回漲到 53,170 筆**，跟 `cwa_station_weather` 當初的累積速度同一個量級。`cwa_station_weather` 的 schema 縮窄已經在同一天執行並驗證穩定（清理後歷經至少一個同步週期，列數沒有再成長），做法直接比照套用。

## 2. Schema 變更

```sql
-- migrations/20260922_cwa_rainfall_narrow_unique_key.sql
--
-- 前置條件：cwa_rainfall 此時必須已經是「每個 station_id 只有一筆」的乾淨狀態。
-- 執行前先重跑：
--   node scripts/cleanup-cwa-rainfall-duplicates.mjs --execute
-- 確認乾淨（dry-run 顯示 toDelete 是 0 或很小才繼續）。

ALTER TABLE cwa_rainfall
  DROP INDEX uq_cwa_rainfall,
  ADD UNIQUE KEY uq_cwa_rainfall (station_id);
```

`obs_time` 保留一般欄位。`upsertCwaRainfall`（`lib/server/cwa/queries.ts`）的 `ON DUPLICATE KEY UPDATE` 子句已經包含 `obs_time = VALUES(obs_time)`（跟 station_weather 一樣，這行本來就存在，不是這次才補的），schema 一改窄，下次同步遇到新 obs_time 就會自動走 UPDATE 覆蓋，不會再 INSERT 新列。

`getNearestRainfallReading`/`listTopRainfallStations`（`lib/server/cwa/queries.ts` 799-848 行附近）目前用「`WHERE obs_time >= NOW()-3小時 GROUP BY station_id` 篩最新一筆再排序」的寫法，這個寫法在 schema 縮窄後依然完全正確（每個 station_id 現在本來就只有一筆，GROUP BY 只是形式上還在，不影響正確性），**不需要修改查詢邏輯本身**，純粹是 schema 層面的變更。

## 3. 驗收標準

- `SHOW CREATE TABLE cwa_rainfall` 顯示 `UNIQUE KEY uq_cwa_rainfall (station_id)`，不再包含 `obs_time`。
- 部署後打 `/api/weather-nearby` 確認 `rainfall.observedAt` 正常回傳且新鮮。
- 觀察至少一次同步週期（CWA rainfall 同步頻率跟 station_weather 一樣是 `:15`/`:45`），確認 `cwa_rainfall` 總列數沒有隨時間增加（穩定在 1,360 個測站附近）。

## 4. 執行紀錄

2026-09-22 執行：
1. 重跑 `node scripts/cleanup-cwa-rainfall-duplicates.mjs --execute` 確認乾淨。
2. 對 production 執行上述 `ALTER TABLE`。
3. 驗證 `SHOW CREATE TABLE` 確認 UNIQUE KEY 已縮窄。
4. 下一次同步週期後確認列數穩定，不再成長。

（本次不需要額外的程式碼變更或部署——查詢邏輯本來就正確，只有 schema 本身需要改。）
