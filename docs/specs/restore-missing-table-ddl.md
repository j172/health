# 修法：復原意外遺失的 disaster_response_points／heritage_assets 建表 DDL

- **Type**: Bug fix，緊急（資料庫從零重建時會直接缺表故障）。
- **Affects**: `lib/server/db/schema.ts`、`lib/server/db/mysql.ts`
- **來源**：登革熱地圖 ticket（issue #269）實作過程中意外發現

## 1. 背景與證據

2026-09-09 的 commit `92fd282`（一個完全無關的「水利署水庫/水位站名稱補強」功能）在編輯
`lib/server/db/schema.ts` 同一段程式碼時，意外刪除了 `disasterResponsePoints`（防災地圖：
避難收容處所／消防救援單位／應變中心）與 `heritageAssets`（文化資產地圖：古蹟／歷史建築／
考古遺址）這兩個既有工具的 `CREATE TABLE` DDL，以及 `lib/server/db/mysql.ts`
`ensureSchema()` 裡對應呼叫這兩個 DDL 的兩行 `p.query(...)`。

因為 `ensureSchema()` 用的是 `CREATE TABLE IF NOT EXISTS`，既有正式站的這兩張表在
2026-09-09 之前就已經存在，所以刪除這兩段程式碼**沒有立即造成任何可觀察的故障**——這正是
問題一直沒被發現的原因。但這代表：**如果資料庫從零重建**（災難復原、建立新環境、複製一份
全新的 staging 環境等情境），這兩張表完全不會被建立，`disaster-map`、`heritage-map` 兩個
既有工具會直接故障。

## 2. 修法

從 commit `92fd282` 的父版本（`92fd282^`）逐字復原被刪除的兩段 DDL（含原始註解）到
`lib/server/db/schema.ts`，並復原 `lib/server/db/mysql.ts` 裡對應的兩行 `p.query()` 呼叫。
**不是重寫，是逐字復原**——避免在復原過程中無意間改動 schema 定義本身。

## 3. 驗收

- `disasterResponsePoints`／`heritageAssets` 兩個 DDL 重新出現在 `TABLE_DDL`，內容與
  92fd282 之前的版本逐字相同。
- `ensureSchema()` 重新呼叫這兩個 DDL。
- `npm run typecheck`、`npm test`（255/255）維持通過。
- 不影響 92fd282 之後新增的任何其他表（`wra_reservoirs`、`wra_water_level_stations`、
  `dengue_vector_surveys`、`wra_dam_structure_stations`、`wra_groundwater_stations` 等）。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
