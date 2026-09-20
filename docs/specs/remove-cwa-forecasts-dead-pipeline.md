# 移除 cwa_forecasts：有 ingestion 沒有任何功能在讀取

- **作者**：Claude（診斷會話）
- **日期**：2026-09-21
- **狀態**：Draft，待 worktree subagent 實作
- **前情**：`docs/specs/cwa-station-weather-duplicate-row-cleanup.md`（issue #378）盤點 CWA 系列資料表時發現的旁支問題

## 1. 現況

`cwa_forecasts` 每小時同步兩次（`:15`/`:45`，`runCwaSync` 的第一個 source），抓的是 CWA「F-C0032-001 三十六小時天氣預報（逐縣市）」，目前累積約 23,000 筆。全庫搜尋（`components/`、`app/`、`lib/`）確認**沒有任何地方讀取 `cwa_forecasts` 這張表**——只有 `upsertCwaForecasts` 在寫，沒有對應的 `getCwaForecasts`/`getForecastByCounty` 之類的查詢函式，UI 也沒有任何「預報」「forecast」「36小時」相關的元件。

這條 pipeline 是 `e0996d9`（一次性批次接入 12 個 CWA 資料集）的一部分，跟同一批次的其他資料集（earthquake、tsunami、alerts、station weather、rainfall、uv index 等）不同，唯獨這一個從未被接上任何前端功能——判斷是當初規劃了要做但沒做完，而不是刻意只做後端儲存。這次盤點決定：**不補做前端功能，直接移除整條 pipeline**（跟之前 `wra_water_outages`「有 ingestion 沒前端」的處理方向一致，但反過來——這次是移除，不是補完）。

## 2. 待辦事項

1. `lib/server/cwa/runSync.ts`：移除 `cwa_forecasts` 那個 `runSource(...)` 區塊（第 38-47 行），以及對應的 `fetchCwaForecasts` import（第 1 行）、`upsertCwaForecasts` import（`queries.ts` import 清單裡的一項）。
2. `lib/server/cwa/sources/forecast.ts`：確認移除後沒有其他地方 import 這個檔案，若沒有就整個檔案刪除。
3. `lib/server/cwa/queries.ts`：移除 `CwaForecastRecord` interface（第 6-14 行附近）與 `upsertCwaForecasts` 函式（第 16-59 行附近，含 SQL）。
4. `lib/server/db/schema.ts`：`cwa_forecasts` 的 `CREATE TABLE IF NOT EXISTS` 定義（第 368 行附近）——保留 schema 定義本身沒有壞處（`CREATE TABLE IF NOT EXISTS` 是冪等的，不會因為表已存在而報錯），但既然整條 pipeline 都移除了，一併刪除這段避免誤導後人以為這張表還在使用中。
5. 新增一個一次性 migration：`migrations/20260921_drop_cwa_forecasts.sql`，內容是 `DROP TABLE IF EXISTS cwa_forecasts;`——**這個 migration 檔案只需要寫出來，不要在 PR 裡執行**（PR 只涉及程式碼變更；實際對 production 下 `DROP TABLE` 由 review/merge 後另外執行，因為這是會刪除全部既有資料的正式環境操作）。
6. 確認 `npm test` / `npm run lint` / `npm run build` 通過（尤其確認移除 import 後沒有其他地方引用到被刪除的型別或函式）。

## 3. 驗收標準

- `runCwaSync()` 不再包含 `cwa_forecasts` 這個 source，同步結果陣列少一項。
- `grep -r "cwa_forecasts\|CwaForecast" lib/ app/ components/` 只會找到 migration 檔案本身，程式碼裡完全乾淨。
- `migrations/20260921_drop_cwa_forecasts.sql` 存在，但 PR 說明清楚註明「這支 migration 尚未對 production 執行，需要 merge 後由有 production DB 存取權限的人另外跑」。
- `npm test`、`npm run lint`、`npm run build` 全部通過。
