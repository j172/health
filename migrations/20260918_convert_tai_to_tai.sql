-- migrations/20260918_convert_tai_to_tai.sql
-- 
-- 選用 SQL Migration 腳本：將線上資料庫中的「台」批次升級為教育部標準正體「臺」
-- 包含 facilities、youbike_stations、npo_organizations 等資料表。
-- 執行前請先在 Staging 環境測試或確認資料庫已有備份。

-- 1. facilities 資料表更新
UPDATE facilities
SET address = REPLACE(address, '台北', '臺北')
WHERE address LIKE '%台北%';

UPDATE facilities
SET address = REPLACE(address, '台中', '臺中')
WHERE address LIKE '%台中%';

UPDATE facilities
SET address = REPLACE(address, '台南', '臺南')
WHERE address LIKE '%台南%';

UPDATE facilities
SET address = REPLACE(address, '台東', '臺東')
WHERE address LIKE '%台東%';

UPDATE facilities
SET address = REPLACE(address, '台灣', '臺灣')
WHERE address LIKE '%台灣%';

UPDATE facilities
SET name = REPLACE(name, '台北', '臺北')
WHERE name LIKE '%台北%';

UPDATE facilities
SET name = REPLACE(name, '台中', '臺中')
WHERE name LIKE '%台中%';

UPDATE facilities
SET name = REPLACE(name, '台南', '臺南')
WHERE name LIKE '%台南%';

UPDATE facilities
SET name = REPLACE(name, '台東', '臺東')
WHERE name LIKE '%台東%';

UPDATE facilities
SET name = REPLACE(name, '台灣', '臺灣')
WHERE name LIKE '%台灣%';

-- 2. youbike_stations 資料表更新（若存在）
UPDATE youbike_stations
SET name = REPLACE(name, '台北', '臺北')
WHERE name LIKE '%台北%';

UPDATE youbike_stations
SET address = REPLACE(address, '台北', '臺北')
WHERE address LIKE '%台北%';

-- 3. npo_organizations 資料表更新（若存在）
UPDATE npo_organizations
SET city = REPLACE(city, '台北', '臺北')
WHERE city LIKE '%台北%';

UPDATE npo_organizations
SET city = REPLACE(city, '台中', '臺中')
WHERE city LIKE '%台中%';

UPDATE npo_organizations
SET city = REPLACE(city, '台南', '臺南')
WHERE city LIKE '%台南%';

UPDATE npo_organizations
SET city = REPLACE(city, '台東', '臺東')
WHERE city LIKE '%台東%';

UPDATE npo_organizations
SET address = REPLACE(address, '台北', '臺北')
WHERE address LIKE '%台北%';

UPDATE npo_organizations
SET address = REPLACE(address, '台中', '臺中')
WHERE address LIKE '%台中%';

UPDATE npo_organizations
SET address = REPLACE(address, '台南', '臺南')
WHERE address LIKE '%台南%';

UPDATE npo_organizations
SET address = REPLACE(address, '台東', '臺東')
WHERE address LIKE '%台東%';

-- 完成標記
SELECT 'Migration 20260918_convert_tai_to_tai complete' AS status;
