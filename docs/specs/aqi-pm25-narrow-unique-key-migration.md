# aqi_readings / pm25_readings：同款 UNIQUE KEY 縮窄 + 補上漏掉的 UPDATE 欄位

- **作者**：Claude（診斷會話）
- **日期**：2026-09-22
- **狀態**：Draft → 已執行（見底部執行紀錄）
- **前情**：issue #379（`cwa_station_weather`）、issue #384（`cwa_rainfall`），同一次 `/grill` 盤點延伸發現

## 1. 現況

盤點全資料庫表格大小時發現 `aqi_readings`（93,744 筆／84 站）、`pm25_readings`（102,760 筆／80 站）也是同一種病：UNIQUE KEY 分別是 `(site_id, recorded_at)`／`(site_name, recorded_at)`，每次同步遇到新的 `recorded_at` 就 INSERT 新列。全庫搜尋確認這兩張表也只有「最新一筆」被查詢使用（`getLatestAqiReadings`／`getNearestAqiReading`／`getNearestPm25Reading`），沒有任何歷史趨勢圖表功能。

**比 weather/rainfall 更嚴重的地方**：`upsertAqiReadings`／`upsertPm25Readings` 的 `ON DUPLICATE KEY UPDATE` 子句原本連 `recorded_at = VALUES(recorded_at)` 都沒有寫（`upsertAqiReadings` 原本的註解甚至誤寫成「re-running the same hour is a no-op update, not a duplicate row」，這個假設本身就是錯的——`recorded_at` 是 UNIQUE KEY 的一部分，不同的 `recorded_at` 本來就一定會走 INSERT，不會是 no-op UPDATE）。這代表**即使現在先縮窄 key，如果不順便補上這行，效果會等同於 `cwa_station_weather` 當初漏寫 `obs_time = VALUES(obs_time)` 的那個 bug**（issue #373）——資料存在但 `recorded_at` 永遠凍結在第一次寫入的時間。這次順便修正，不用等使用者回報才發現。

`EXPLAIN` 確認目前的查詢已經因為表變大而退化：`getNearestAqiReading` 用的 `WHERE recorded_at = (SELECT MAX(recorded_at) FROM aqi_readings WHERE lat IS NOT NULL)` 子查詢是 `type=ALL` 全表掃描（93,185 列估計），雖然現在還沒到卡死的程度，但架構上跟造成 2026-09-21 中斷的 `cwa_station_weather` 完全同款，及早處理。

## 2. Schema 變更

```sql
-- migrations/20260922_aqi_pm25_narrow_unique_key.sql

ALTER TABLE aqi_readings
  DROP INDEX uq_aqi_reading,
  ADD UNIQUE KEY uq_aqi_reading (site_id);

ALTER TABLE pm25_readings
  DROP INDEX uq_pm25_reading,
  ADD UNIQUE KEY uq_pm25_reading (site_name);
```

## 3. 程式碼變更（已完成，本次修復的一部分）

`lib/server/aqi/queries.ts`（`upsertAqiReadings`）與 `lib/server/aqi/pm25Queries.ts`（`upsertPm25Readings`）的 `ON DUPLICATE KEY UPDATE` 子句都補上 `recorded_at = VALUES(recorded_at)`。查詢函式（`getLatestAqiReadings`、`getNearestAqiReading`、`getNearestPm25Reading`）不需要修改——它們依賴的「同一批次寫入的 `recorded_at` 彼此相同」這個假設，在 key 縮窄後依然成立（每站現在只有一筆，不影響這個假設）。

## 4. 待辦事項

1. 新增清理腳本，把兩張表各自清成「每站只留最新一筆」（沿用 `scripts/cleanup-cwa-rainfall-duplicates.mjs` 的架構，分組欄位分別是 `site_id`／`site_name`）。
2. 對 production 執行清理，確認乾淨。
3. 執行上述 `ALTER TABLE`。
4. 部署程式碼變更（`recorded_at = VALUES(recorded_at)`）。
5. 驗證 `/tools/aqi`、`/api/aqi/nearest`、`/api/weather-nearby`（內含 aqi/pm25 欄位）的 `recorded_at`／`aqiValue` 正常且新鮮。
6. 觀察至少一次同步週期，確認兩張表列數不再成長。

## 5. 執行紀錄

2026-09-22 執行：清理 → schema 縮窄 → 部署 `recorded_at = VALUES(recorded_at)` 修正 → 多站驗證。
