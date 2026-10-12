# 台水停水資訊：新版資料表從未接上即時擷取，永遠顯示種子假資料

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應使用者回報**：「1. 台水停水資訊 API 補充」

## 1. 診斷結果（已完成，請勿重複調查，直接依此修）

使用者原本以為要「新增排程來源」（改用 `https://web.water.gov.tw/wateroffapi/openData/export/json`），但實際排查後發現這不是新增功能，而是一個**現有功能的資料從未真正被即時擷取過**的 bug：

1. 站上目前**同時存在兩套完全獨立的停水資料管線**，彼此互不相通：
   - **舊版（仍在運作、有真實即時資料）**：`app/api/water-outages/route.ts` → `lib/server/water/queries.ts` → 表 `water_outages`。其擷取邏輯在 `lib/server/water/ingestWaterOutages.ts`，抓的是 CSV 端點（`export/csv-utf8`），並已在 `lib/server/cron/registerJobs.ts` 註冊「每小時 :25」執行。SSH 到生產主機確認：`~/health_app/logs/water-outages-cron.log` 顯示這支排程持續成功執行（`{"ok":true,"summary":{"totalFetched":1,...}}`），資料是活的。
   - **新版（2026-09-18 上線、`/tools/water-outages` 頁面實際使用的版本，但資料是死的）**：`app/api/tools/water-outages/route.ts` → `lib/server/waterOutages/queries.ts` → 表 `wra_water_outages`，並附一份靜態種子 `data/waterOutages/waterOutagesSeed.ts`（`WATER_OUTAGES_SEED`）供資料庫查詢失敗/為空時 fallback。
2. **關鍵問題**：全專案（`lib/server/cron/registerJobs.ts`、`scripts/`、`.github/workflows/`）**完全沒有任何程式碼會把資料寫入 `wra_water_outages` 這張表**。也就是說新版从上線那天起，資料庫裡這張表一直是空的，`getWaterOutagesOverview()` 每次都命中 fallback，把種子假資料當成即時資料端出來給使用者看——這正是使用者感覺「資料不對/需要補充」的真正原因，而不是端點格式（JSON vs CSV）的問題。
3. 額外確認：`https://web.water.gov.tw/wateroffapi/openData/export/json` 這個 JSON 端點欄位其實**比 CSV 端點少**（缺少「屬性」「停水類型」「停水戶數」「降壓戶數」等欄位），不適合作為主要資料源；繼續用 CSV 端點即可，只是要接到新表上。

## 2. 目標

讓 `/tools/water-outages` 頁面顯示的資料是每小時更新的真實停水資訊，而不是永遠固定的種子假資料。

## 3. 實作方向（建議，實作者可依實際 schema 調整細節）

1. 在 `lib/server/waterOutages/` 底下新增一支擷取函式（可直接參考、複用 `lib/server/water/ingestWaterOutages.ts` 既有的 CSV 抓取與解析邏輯，勿整包複製貼上，抽出共用的 CSV parser 為佳），把資料寫入 `wra_water_outages` 表（欄位對應見 `lib/server/db/schema.ts` 內該表定義），包含：
   - 基本欄位對應（`outage_id`、`title`、`county`、`township`、`outage_type`、`start_time`、`end_time`、`affected_areas`、`affected_households`、`contact_phone`、`status`、`lat`/`lng`、`source`）。
   - `status` 的 active/scheduled/resolved 判斷邏輯需要合理（可參考舊版 `is_within_one_week` 的概念，但新表用的是 `status` 欄位，需自訂根據 `start_time`/`end_time` 與現在時間的判斷規則）。
   - 若 CSV 沒有對應到緊急供水站資料（`water_stations_json`、`EMERGENCY_WATER_STATIONS_SEED`），先保留種子供水站資料本身即可（那部分不是本次要修的重點），只修「停水事件」本身的即時性。
2. 在 `lib/server/cron/registerJobs.ts` 註冊這支新的擷取任務排程（建議比照舊版每小時一次，錯開 `:25` 避免與其他排程撞在一起——可與 [[github-actions-cron-decollision]] 工單協調時間點，但不要因此阻塞本工單）。
3. 確認新任務使用專案標準的 `httpGetText`（`@/lib/server/net/httpClient`），**不要**用 Node 全域 `fetch()`（專案既有規範，避免 Undici WASM OOM）。
4. 舊版 `lib/server/water/*`、`app/api/water-outages/route.ts`、表 `water_outages` 目前看起來是孤兒程式碼（沒有頁面在用，只有一支路由自己查自己）。**本工單不要求刪除**，但請在 PR 說明中列出這個發現，交給人工決定日後是否清除，避免本次 PR 範圍擴大。

## 4. 驗收標準

- 部署後，`wra_water_outages` 表能被排程任務持續寫入資料（可用 `logs/` 底下對應的 log 檔或既有的 `runGuarded` 機制驗證有成功寫入紀錄）。
- `/api/tools/water-outages` 回傳的資料反映近期（同一天內）WRA 官方 CSV 的實際內容，而非固定不變的種子資料（種子資料的 `outageId` 開頭是 `TWC-115-`，可用來確認是否還在吃 fallback）。
- 既有測試（若有 `waterOutages` 相關測試）需通過；若無，請補上至少一項驗證擷取函式能正確解析 CSV 並產出正確筆數的單元測試。

## 5. 交付物

- 新擷取函式 + cron 註冊 + 對應測試。
- PR 說明需包含「舊版孤兒程式碼」發現的註記。
