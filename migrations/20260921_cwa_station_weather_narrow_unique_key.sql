-- migrations/20260921_cwa_station_weather_narrow_unique_key.sql
--
-- 把 cwa_station_weather 的 UNIQUE KEY 從 (dataset_id, station_id, obs_time)
-- 改窄成 (dataset_id, station_id),讓每次同步遇到新 obs_time 走 UPDATE
-- 覆蓋舊列,而不是 INSERT 新列——從根本停止重複列累積。
--
-- 詳見 docs/specs/cwa-station-weather-narrow-unique-key-migration.md。
--
-- 前置條件：執行前必須先確認表裡沒有重複的 (dataset_id, station_id) 組合,
-- 否則下面的 ALTER TABLE 會失敗。先跑：
--   node scripts/cleanup-cwa-station-weather-duplicates.mjs
-- 確認 dry-run 顯示 toDelete 是 0（或很小),不是 0 就先加 --execute 清一次。
--
-- 執行前請先在 Staging 環境測試或確認資料庫已有備份
-- （2026-09-21 清理時建立的 cwa_station_weather_backup_20260920 仍留在主機上）。

ALTER TABLE cwa_station_weather
  DROP INDEX uq_cwa_station_weather,
  ADD UNIQUE KEY uq_cwa_station_weather (dataset_id, station_id);
