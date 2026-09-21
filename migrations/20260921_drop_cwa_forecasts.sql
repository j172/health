-- migrations/20260921_drop_cwa_forecasts.sql
--
-- cwa_forecasts（CWA F-C0032-001 三十六小時天氣預報）每小時同步兩次，累積約
-- 23,000 筆，但全庫（components/、app/、lib/）搜尋確認沒有任何查詢函式或 UI
-- 元件讀取這張表——只有 upsertCwaForecasts 在寫。判斷為當初批次接入 12 個
-- CWA 資料集（e0996d9）時規劃了前端功能但沒做完，而不是刻意只做後端儲存。
--
-- 這次盤點決定不補做前端功能，直接移除整條 pipeline（詳見
-- docs/specs/remove-cwa-forecasts-dead-pipeline.md，issue #380）。
-- 程式碼（runSync.ts 的 source、queries.ts 的型別與 upsert 函式、schema.ts
-- 的 CREATE TABLE 定義）已在同一個 PR 移除。
--
-- 這支 migration 尚未對 production 執行，需要 merge 後由有 production DB
-- 存取權限的人另外跑——這是會刪除全部既有資料（約 23,000 筆）的正式環境
-- 操作，不可逆，執行前請確認不再需要這批歷史預報資料。

DROP TABLE IF EXISTS cwa_forecasts;
