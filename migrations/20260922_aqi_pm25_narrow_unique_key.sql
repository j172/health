-- migrations/20260922_aqi_pm25_narrow_unique_key.sql
--
-- 把 aqi_readings / pm25_readings 的 UNIQUE KEY 縮窄，比照 cwa_station_weather
-- (#379) / cwa_rainfall (#384) 的同款修法。詳見
-- docs/specs/aqi-pm25-narrow-unique-key-migration.md。
--
-- 前置條件：執行前必須先確認兩張表都沒有重複的 site_id / site_name，先跑：
--   node scripts/cleanup-aqi-pm25-duplicates.mjs --execute

ALTER TABLE aqi_readings
  DROP INDEX uq_aqi_reading,
  ADD UNIQUE KEY uq_aqi_reading (site_id);

ALTER TABLE pm25_readings
  DROP INDEX uq_pm25_reading,
  ADD UNIQUE KEY uq_pm25_reading (site_name);
