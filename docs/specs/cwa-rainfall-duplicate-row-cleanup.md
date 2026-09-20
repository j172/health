# cwa_rainfall：同款重複列清理（跟 cwa_station_weather 同一種病根）

- **作者**：Claude（診斷會話）
- **日期**：2026-09-21
- **狀態**：Draft，待 worktree subagent 實作腳本，實際執行由 orchestrator 對 production 進行
- **前情**：`docs/specs/cwa-station-weather-duplicate-row-cleanup.md`（issue #378）、`scripts/cleanup-cwa-station-weather-duplicates.mjs`（commit `ecc806d`）

## 1. 現況

跟進 #378 對 CWA 系列資料表的盤點：`cwa_rainfall` 的 UNIQUE KEY 是 `(station_id, obs_time)`，同一種「每次同步遇到新 obs_time 就 INSERT 新列，從不覆蓋」的模式。2026-09-21 確認總列數 **2,968,147 筆**（比當天造成中斷的 `cwa_station_weather` 清理前的 1,856,771 筆還多），1,360 個測站，佔 314MB。

**跟 `cwa_station_weather` 不同的是，這張表目前沒有造成效能懸崖**：`getNearestRainfallReading`／`listTopRainfallStations`（`lib/server/cwa/queries.ts` 799-848 行附近）的查詢設計是先用 `WHERE obs_time >= NOW() - INTERVAL 3 HOUR GROUP BY station_id` 篩出「每站最近 3 小時內最新一筆」的小集合，才對這個小集合算距離排序，而不是對整張表算 haversine。`EXPLAIN` 證實 MariaDB 用 `Using index for group-by`（loose index scan）處理這個篩選，實測 0.2 秒。所以這次清理是**預防性維護（回收空間、避免依賴查詢優化器的僥倖），不是搶修**。

確認過 `cwa_rainfall` 沒有任何程式碼路徑需要它的歷史列——`getNearestRainfallAccumulation` 需要的月/年累積雨量歷史是從另一張表 `cwa_daily_rainfall`（每日聚合，時間欄位是它 UNIQUE KEY 的必要部分，**不在這次清理範圍內，不要動它**）讀取，`cwa_rainfall` 本身只被用來查「最新一筆即時觀測」。

## 2. 提案：比照 cwa_station_weather 的清理腳本，調整分組欄位

新增 `scripts/cleanup-cwa-rainfall-duplicates.mjs`，架構完全比照 `scripts/cleanup-cwa-station-weather-duplicates.mjs`（SSH 遠端執行、dry-run 預設、`--execute` 才真的刪、批次刪除、事後 `OPTIMIZE TABLE`），差異點：

1. **表名**：`cwa_rainfall`（沒有 `dataset_id` 欄位，分組只用 `station_id`，不是 `(dataset_id, station_id)`）。
2. **保留規則**：`GROUP BY station_id`，每站只留 `obs_time` 最新一筆。
3. **這次明確指示：不建立備份表**（跟 `cwa_station_weather` 那次的預設行為不同——這次使用者確認過不需要備份，直接刪，`--no-backup` 應該是這支腳本的預設行為而不是選項，或至少 PR 裡預設用 `--no-backup` 執行）。

```js
// 分組 SQL 差異示意（實作時直接照 cleanup-cwa-station-weather-duplicates.mjs 的
// keep_latest / keep_ids 兩段 temporary table 邏輯改寫，只是 GROUP BY / JOIN
// 條件從 (dataset_id, station_id) 改成單純 station_id）：
CREATE TEMPORARY TABLE keep_latest AS
  SELECT station_id, MAX(obs_time) AS max_obs_time
  FROM cwa_rainfall
  GROUP BY station_id;

CREATE TEMPORARY TABLE keep_ids AS
  SELECT t.id FROM cwa_rainfall t
  JOIN keep_latest l ON t.station_id = l.station_id AND t.obs_time = l.max_obs_time;
```

## 3. 待辦事項

1. 新增 `scripts/cleanup-cwa-rainfall-duplicates.mjs`（可直接複製 `cleanup-cwa-station-weather-duplicates.mjs` 改分組欄位與表名，並把備份步驟預設關閉）。
2. Dry-run 驗證：本地跑 `node scripts/cleanup-cwa-rainfall-duplicates.mjs`（不加 `--execute`），確認印出的 `before`/`keep`/`toDelete` 數字合理（預期 `keep` 接近 1,360 個測站數）。
3. **不需要在這次 PR 裡對 production 執行 `--execute`**——PR 只需要腳本本身跑得動 dry-run；實際執行由 orchestrator 在 PR merge 後另外對 production 跑。
4. `npm run lint` 通過（沿用既有腳本的 ESLint 設定）。

## 4. 驗收標準

- `scripts/cleanup-cwa-rainfall-duplicates.mjs` dry-run 能正確連線（本機 `.env` 密碼已知過期，腳本應該會自動 fallback 到 SSH 遠端執行，這是既有腳本已經處理好的行為，不用重新設計）並印出合理的 before/keep/toDelete 數字。
- 腳本預設不建立備份表（或有清楚的 `--no-backup` 旗標且 PR 說明採用它），符合這次使用者的決定。
- PR 說明清楚寫明：這支腳本尚未對 production 執行，需要 merge 後由 orchestrator 另外執行。
