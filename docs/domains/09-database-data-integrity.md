# 09 資料庫與資料正確性

> 合併自 10 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相

| 項目 | 現況 |
|---|---|
| 引擎 | MariaDB 10.11（HawkHost），`mysql2` 連線池 `connectionLimit: 8` |
| 建表 | `lib/server/db/schema.ts` 共 79 個 `CREATE TABLE IF NOT EXISTS`，由 `ensureSchema()` 冪等執行 |
| 冷啟動 | `ensureSchema()` 以單一 Promise 記憶（`schemaReadyPromise`），併發呼叫共用同一次 migration，失敗時重設 |
| 手動 migration | `migrations/*.sql`（5 個），**需人工對正式庫執行，不會自動套用** |
| 匯入驗證 | `zod` schema 驗證曾出事故的資料源，失敗寫入 `ingest_errors` |
| 擷取紀錄 | `ingest_runs`／`ingest_errors` |

### 1.1 「時間欄位放進 UNIQUE KEY」導致無限膨脹（同一病根，4 張表）

| 表 | 原 UNIQUE KEY | 清理前 | 處置 |
|---|---|---|---|
| `cwa_station_weather` | `(dataset_id, station_id, obs_time)` | 1,856,771 列 → 拖垮全站 `/api/*` | 清理＋縮窄為 `(dataset_id, station_id)` |
| `cwa_rainfall` | `(station_id, obs_time)` | 2,968,147 列／314MB；清理後一天回漲到 53,170 | 清理＋縮窄為 `(station_id)` |
| `aqi_readings` | `(site_id, recorded_at)` | 93,744 列 | 縮窄＋補上漏寫的 `recorded_at = VALUES(...)` |
| `pm25_readings` | `(site_name, recorded_at)` | 102,760 列 | 同上 |

排除名單（刻意保留歷史、不是 bug）：`cwa_daily_rainfall`、`cwa_township_hazards`（事件觸發）、`aqx_hourly_narrow`／`aqx_hourly_wide`（有分頁的歷史檔案）。

---

## 2. 長期有效的決策

- 只查「每站最新一筆」的表，UNIQUE KEY **不得包含時間欄位**。
- 「先清理、schema 之後再修」不可接受：未修 schema 約 24 小時內就會再度累積。
- 任何改動查詢的部署，**部署後必須實打正式 API**（#376 在測試全綠下造成正式回歸）。
- 匯入驗證失敗必須留下紀錄，不可讓錯誤資料靜默寫入，也不可被 try/catch 吞掉。

---

## 3. 核對後仍未完成的項目

| # | 項目 | 說明 |
|---|---|---|
| **DB-1** | **`schema.ts` 的建表 DDL 仍是舊的寬 UNIQUE KEY** | 4 張表的縮窄只存在於 `migrations/*.sql`（已在正式庫手動執行），但 `ensureSchema()` 使用的 `CREATE TABLE` 仍宣告含 `obs_time`／`recorded_at` 的鍵。**資料庫一旦從零重建（災難復原、新環境），這 4 張表會重新開始無限膨脹**，重演 2026-09-21 全站中斷。修法：把 `schema.ts` 的 DDL 改為窄鍵，與 migration 一致，並加測試比對兩者 |
| DB-2 | `migrations/` 沒有套用紀錄 | 無 migration 版本表，無法得知哪個環境套用過哪支 SQL |

---

## 4. 逐份紀錄

#### 復原意外遺失的建表 DDL ✅
- 原檔：[restore-missing-table-ddl.md](../archive/specs/restore-missing-table-ddl.md)（#269）
- 無關的 commit `92fd282` 誤刪 `disaster_response_points`、`heritage_assets` 的 DDL；因 `IF NOT EXISTS` 正式庫無感，只在重建時才會爆。逐字從父版本復原。

#### ensureSchema() 併發呼叫造成冷啟動死鎖 ✅
- 原檔：[ensure-schema-concurrent-call-deadlock.md](../archive/specs/ensure-schema-concurrent-call-deadlock.md)（PR #395、#396）
- 原本以布林 `schemaReady` 判斷，11 個呼叫點在冷啟動同時進入 migration；連一般新聞頁的 `generateMetadata` 都會觸發寫入設施表。改為共用 Promise。

#### 匯入腳本導入 Zod 驗證 ✅
- 原檔：[zod-import-schema-validation.md](../archive/specs/zod-import-schema-validation.md)（#268）
- 先套用在 3 個曾因上游欄位變更出事的資料源（`lib/server/validation/importSchema.ts`），其餘列為後續比照清單。

#### cwa_station_weather obs_time 永遠凍結 ✅
- 原檔：[cwa-station-weather-obstime-update-fix.md](../archive/specs/cwa-station-weather-obstime-update-fix.md)（#373、PR #376）
- `ON DUPLICATE KEY UPDATE` 漏寫 `obs_time`。修正後新增的第二排序鍵在 186 萬列上造成查詢懸崖，`stationWeather` 全面變 null，以 hotfix `e144a92` 回退排序。

#### cwa_station_weather 重複列累積與效能懸崖 ✅
- 原檔：[cwa-station-weather-duplicate-row-cleanup.md](../archive/specs/cwa-station-weather-duplicate-row-cleanup.md)（#378）
- 53 天累積 1,856,771 列；haversine 無法用索引，全表掃描＋filesort 佔滿連線池。以 `scripts/cleanup-cwa-station-weather-duplicates.mjs` 清到 1,239 列。

#### cwa_station_weather UNIQUE KEY 縮窄 🟡
- 原檔：[cwa-station-weather-narrow-unique-key-migration.md](../archive/specs/cwa-station-weather-narrow-unique-key-migration.md)（#379）
- 正式庫已執行 `migrations/20260921_cwa_station_weather_narrow_unique_key.sql`；`schema.ts` 未同步（待辦 DB-1）。

#### cwa_rainfall 重複列清理 ✅
- 原檔：[cwa-rainfall-duplicate-row-cleanup.md](../archive/specs/cwa-rainfall-duplicate-row-cleanup.md)（#381）
- 查詢先以「最近 3 小時 GROUP BY station_id」縮小集合，`EXPLAIN` 為 loose index scan（0.2 秒），所以是預防性維護而非搶修。

#### cwa_rainfall UNIQUE KEY 縮窄 🟡
- 原檔：[cwa-rainfall-narrow-unique-key-migration.md](../archive/specs/cwa-rainfall-narrow-unique-key-migration.md)（#384）
- 當初只開了清理 issue、漏了 schema 修正，一天就回漲到 53,170 列；正式庫已執行，`schema.ts` 未同步（待辦 DB-1）。

#### aqi_readings／pm25_readings 縮窄並補 UPDATE 欄位 🟡
- 原檔：[aqi-pm25-narrow-unique-key-migration.md](../archive/specs/aqi-pm25-narrow-unique-key-migration.md)（#385）
- 原註解誤以為「同一小時重跑是 no-op」；`getNearestAqiReading` 的 `MAX(recorded_at)` 子查詢已退化為全表掃描。正式庫已執行，`schema.ts` 未同步（待辦 DB-1）。

#### 移除 cwa_forecasts 無人讀取的管線 ✅
- 原檔：[remove-cwa-forecasts-dead-pipeline.md](../archive/specs/remove-cwa-forecasts-dead-pipeline.md)（#380）
- 每小時寫兩次、累積約 23,000 筆，全站沒有任何讀取點；連同 `migrations/20260921_drop_cwa_forecasts.sql` 移除。
