-- migrations/20260922_cwa_rainfall_narrow_unique_key.sql
--
-- 把 cwa_rainfall 的 UNIQUE KEY 從 (station_id, obs_time) 改窄成 (station_id)，
-- 讓每次同步遇到新 obs_time 走 UPDATE 覆蓋舊列，而不是 INSERT 新列——比照
-- cwa_station_weather 的同款修法（issue #379）。
--
-- 詳見 docs/specs/cwa-rainfall-narrow-unique-key-migration.md。
--
-- 前置條件：執行前必須先確認表裡沒有重複的 station_id，否則下面的
-- ALTER TABLE 會失敗。先跑：
--   node scripts/cleanup-cwa-rainfall-duplicates.mjs --execute
-- 確認乾淨。

ALTER TABLE cwa_rainfall
  DROP INDEX uq_cwa_rainfall,
  ADD UNIQUE KEY uq_cwa_rainfall (station_id);
