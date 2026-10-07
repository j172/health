# SPEC-20260930: 修正庇護工場 `facility_type` 寫入/查詢不一致導致 DB 資料永久失效 (Sheltered Workshops facility_type Bugfix)

- **Issue/Ticket**: #422
- **Status**: Approved — 待實作
- **Author**: Antigravity Assistant & Engineering Team
- **Date**: 2026-09-30
- **Related**: SPEC-20260930-NPO-ORGANIZATIONS-DEDUP-AND-SCOPE.md（同一份前置調查的姊妹單，範圍刻意切開，可獨立先行修復並部署）

---

## 1. 核心問題與根因 (Problem Statement & Root Cause)

`/tools/sheltered-workshops`（全國庇護工場與身障展售地圖）目前**每一次請求都在悄悄地把使用者導向靜態種子檔案**，而非資料庫中的即時資料，且此狀況自該工具上線以來從未間斷。

### 1.1 查詢端讀取的 facility_type

`app/tools/facilityConfigs.ts:449-450`：

```ts
"sheltered-workshops": {
  facilityType: "sheltered_workshop",
  ...
```

此設定值經由 `lib/server/facilities/queries.ts`（`WHERE facility_type = ?`，見該檔 `:280`、`:404`）向 MySQL `facilities` 表查詢 `facility_type = 'sheltered_workshop'` 的列。

### 1.2 寫入端實際寫入的 facility_type

`scripts/ingest-sheltered-workshops.mjs` 是唯一會處理 `data/sheltered-workshops.json`（61 筆庇護工場公益禮盒名冊）並寫回 `facilities` 表的腳本。其寫入路徑分兩種情況：

- **找不到既有機構、須新增（INSERT）**：`scripts/ingest-sheltered-workshops.mjs:147-159`（本地連線路徑）與對應的 `:283-295`（遠端 SSH 路徑）都執行：

  ```sql
  INSERT INTO facilities (
    facility_type, source_key, source_id, name, address, phone, lat, lng,
    service_item, data_org, extra_json, synced_at, created_at, updated_at
  ) VALUES (?, ?, ?, ...)
  ```

  帶入的第一個參數（`facility_type`）在 `:161`／`:297` 寫死為 `"npo"`，`source_key` 才是 `"sheltered_workshop"`（`:162`／`:298`）。也就是說**新增列的 `facility_type` 是 `'npo'`，不是 `'sheltered_workshop'`**。

- **找到既有機構、屬於既存資料（UPDATE，「enrichedCount」）**：`:122-144`／`:258-280` 只更新 `address`／`phone`／`lat`／`lng`／`service_item`／`extra_json` 等欄位，**完全不碰 `facility_type` 欄位**。既有機構原本是什麼 `facility_type`（例如 `npo`、`tax_organization`、`disability_welfare` 等，取決於它最初是被哪支匯入腳本建立的），豐富化後依然維持原值。

  另有一條獨立的、更早期的自動同步邏輯在 `lib/server/db/mysql.ts:331-371`（啟動時的 auto-seed/sync），同樣對新增列寫死 `facility_type = 'npo'`（`:362`），對既有列同樣只 UPDATE 不碰 `facility_type`（`:355-358`）。

**結論**：全庫沒有任何程式路徑會把一列的 `facility_type` 設為字串 `'sheltered_workshop'`。`facilityConfigs.ts:450` 查詢的值因此永遠比對不到任何一列，`WHERE facility_type = 'sheltered_workshop'` 恆為 0 筆。

### 1.3 靜默 fallback 掩蓋了問題

`sheltered-workshops` 工具在 DB 查詢回傳 0 筆時，會 fallback 到靜態種子檔（`data/facilities-seeds/sheltered_workshop.json`，61 筆；`data/sheltered-workshops.json` 為其鏡像來源）。由於這個 fallback 行為本身「看起來運作正常」（頁面仍能顯示 61 筆完整資料），此 bug 沒有觸發任何錯誤或空頁面，因而長期未被發現——**任何透過 `ingest-sheltered-workshops.mjs` 對 DB 所做的更新（地址修正、電話更新、新商品連結等）事實上從未對外顯示過**，使用者看到的資料自上線以來就是同一份靜態快照。

---

## 2. 修法選項與建議 (Fix Options & Recommendation)

有兩種修法，修的是同一個不一致，但改的是不同一側：

### 選項 A：修正寫入端（讓 ingestion 寫入 `facility_type = 'sheltered_workshop'`）

修改 `scripts/ingest-sheltered-workshops.mjs`（`:161`、`:297`）與 `lib/server/db/mysql.ts:362` 的 INSERT，把 `facility_type` 參數從 `"npo"` 改為 `"sheltered_workshop"`。

- **風險**：
  - 這 61 筆機構目前多半是靠 fuzzy name matching（`normalizeOrgName()`，見 `lib/server/npoOrganizations/npoUtils.ts:8-22`）比對到**既有的** `npo`／其他 facility_type 列並做 UPDATE（enrichedCount 路徑），而非新增。UPDATE 路徑目前不碰 `facility_type`，若要讓這些「enriched」既有列也被 `sheltered-workshops` 工具的查詢找到，必須連同 UPDATE 陳述式一起補上 `facility_type = 'sheltered_workshop'`（或至少新增一個 `isShelteredWorkshop` 旗標式的查詢條件）。否則只有「新增」路徑（insertedCount，通常是少數比對不到既有機構的項目）會被改對，多數既有機構仍然查不到。
  - 若把某一列的 `facility_type` 從 `'npo'` 直接改成 `'sheltered_workshop'`，該列會**從 `npo-organizations` 工具的查詢結果中消失**（`lib/server/npoOrganizations/queries.ts:129` 的 `NPO_FACILITY_TYPES_SQL` 用 `IN ('npo', 'tax_organization', 'disability_welfare')` 顯式列出型別，不含 `sheltered_workshop`；能維持在 npo-organizations 名單內完全是靠同一 SQL 中的 `OR (extra_json LIKE '%"hasProducts":true%')` 這個獨立條件撐著，即 `HAS_PRODUCTS_SQL`，`:126`）。也就是說，把 `facility_type` 改掉**不會**讓這些機構從 npo-organizations 消失，因為 `hasProducts:true` 這個 OR 分支仍然成立——兩份查詢邏輯剛好都覆蓋得到，這點需要在修復後的驗證中明確確認（見第 3 節）。

### 選項 B：修正查詢端（讓 `facilityConfigs.ts` 查詢比對 `facility_type = 'npo'` 搭配 `source_key = 'sheltered_workshop'`，或直接查 `hasProducts:true`）

修改 `app/tools/facilityConfigs.ts:450`，讓 `sheltered-workshops` 工具改用「`source_key = 'sheltered_workshop'`」或「`extra_json` 含 `hasProducts:true`」作為篩選條件，而不是不存在的 `facility_type = 'sheltered_workshop'`。

- **問題**：`facilityConfigs.ts` 目前的抽象只支援單一 `facilityType` 字串對應 `lib/server/facilities/queries.ts` 的 `WHERE facility_type = ?`（`:280`、`:404`），沒有「用 `source_key` 或 `extra_json` 篩選」的既有通用機制，改這一側需要新增一種查詢模式（或直接讓 `sheltered-workshops` 工具改接 `npoOrganizations/queries.ts` 的 `hasProducts` 篩選，等於讓它變成「npo-organizations 的一個篩選檢視」）。这会让 `sheltered-workshops` 与 `npo-organizations`（見姊妹 SPEC 的 Problem B）在資料層面更深地耦合，而不是解耦。

### 建議：採用選項 A（修正寫入端），理由

1. `facility_type` 欄位在全站的語意就是「這一列屬於哪個獨立工具/資料集」（`lib/server/facilities/queries.ts` 的整個查詢介面都是圍繞 `facility_type` 設計的通用抽象），`sheltered_workshop` 作為工具名已經在 `facilityConfigs.ts` 中被當作正確值使用——**修正資料使其符合既有查詢抽象**，比在查詢層為單一工具開特例、引入 `source_key`/`extra_json` 篩選這種新機制，更符合現有架構慣例、影響面更小。
2. 選項 A 同時修好本 bug 的根因（DB 資料永遠讀不到）而不需改動任何前端/API 介面。
3. 需要同步處理的細節（見下）：
   - **新增路徑**（`insertedCount`）：直接把 `INSERT` 的 `facility_type` 參數由 `"npo"` 改為 `"sheltered_workshop"`（`scripts/ingest-sheltered-workshops.mjs:161`、`:297`；`lib/server/db/mysql.ts:362` 視是否仍需保留此重複的 auto-seed 邏輯一併處理，或評估是否該邏輯已被 `ingest-sheltered-workshops.mjs` 完全取代而可移除，屬於後續決策，不在本次修復範圍內展開）。
   - **既有列 enrich 路徑**（`enrichedCount`）：`UPDATE` 陳述式（`:122-144`、`:258-280`）需要新增 `facility_type = 'sheltered_workshop'` 到 SET 子句，才能讓過去被 fuzzy-match 到的既有機構（不論原本是 `npo` 還是其他型別）也在下次 ingestion 執行後被 `sheltered-workshops` 工具的查詢找到。
   - 需要先跑一次 `node scripts/ingest-sheltered-workshops.mjs`（正式環境）才能讓既有 61 筆資料的 `facility_type` 被回填更新——**光改程式碼不會回填既存資料**，必須重跑一次 ingestion（見第 3 節驗證計畫）。

---

## 3. 驗證計畫 (Verification Plan)

修復並重跑 ingestion 後，需要確認 `sheltered-workshops` 工具是**真的在吃 DB 資料**，而不是仍落在靜態 fallback：

1. **DB 面驗證**：
   - `SELECT COUNT(*) FROM facilities WHERE facility_type = 'sheltered_workshop'`，重跑 ingestion 前應為 0，重跑後應接近 61（新增+既有 enrich 兩路徑之和，實際數字取決於有多少筆是新增 vs. 既有機構 enrich）。
2. **API/頁面面驗證**：
   - 人工在 DB 中修改一筆 `facility_type = 'sheltered_workshop'` 列的 `phone` 或 `service_item`（找一筆非種子檔案原始值的欄位改成明顯可辨識的測試字串），重新整理 `/tools/sheltered-workshops` 頁面或呼叫其對應 API route，確認變更值有反映在回應中，而不是種子檔案的舊值——這是唯一能區分「讀 DB」vs「讀靜態 fallback」的可靠方法，因為兩份資料在筆數與大部分欄位上高度相似，肉眼比對筆數不足以確認。
   - 確認 fallback 邏輯本身（DB 查詢失敗或回傳 0 筆時退回 `data/facilities-seeds/sheltered_workshop.json`）維持不動，僅是不再被「假 0 筆」誤觸發——它仍是合理的容錯機制，不建議在本次修復中移除。
3. **回歸驗證**：
   - 確認 `npo-organizations` 工具在修復前後，這 61 筆機構（或其中被 fuzzy-match 命中的子集）仍然出現在結果中（因 `hasProducts:true` 條件不受本次修復影響，見第 2 節選項 A 的風險分析）——避免修好 A 卻意外破壞 B。
   - `npm run typecheck` 與現有測試套件（若有涵蓋 ingestion 腳本或 facilityConfigs 的測試）需全數通過。

---

## 4. 靜態種子檔的後續處置 (Follow-up: Static Seed File Disposition)

修復後，`data/facilities-seeds/sheltered_workshop.json`（及其來源鏡像 `data/sheltered-workshops.json`）將只在 DB 查詢失敗或回傳 0 筆時才會被用到（容錯 fallback），**理論上會成為極少數情況才觸發的備援資料，而非本次修復前那種「事實上的唯一資料來源」**。

- 是否要保留這份靜態檔案作為長期容錯機制（建議保留——它同時也是 `ingest-sheltered-workshops.mjs` 的資料來源輸入，本來就需要存在）、是否要新增監控/告警在 fallback 被觸發時通知（例如 DB 查詢回傳 0 筆但預期應有資料時），屬於**後續獨立決策**，本規格不在此處刪除或修改該檔案，僅標記供人工審閱。

---

## 5. 變更檔案清單（草案，待審核後依此開票）(Anticipated Changed Files)

1. `scripts/ingest-sheltered-workshops.mjs`：新增路徑 `facility_type` 參數改為 `"sheltered_workshop"`；既有列 enrich 的 `UPDATE` 陳述式新增 `facility_type = 'sheltered_workshop'`（本地與遠端 SSH 兩份幾乎重複的邏輯都要同步改，`:147-176` 與 `:281-312`）。
2. `lib/server/db/mysql.ts:331-371`：視是否保留此重複 auto-seed 邏輯，若保留則比照第 1 點同步修正；若評估為已被 ingestion 腳本取代的死路徑，則標記待清理（不在本次範圍內移除）。
3. 正式環境重跑一次 `node scripts/ingest-sheltered-workshops.mjs`，回填既存資料。
4. 本規格文件。

---

## 6. 優先順序與範圍切割理由 (Why This Is a Separate, Higher-Priority Spec)

此問題是**功能性 bug**（使用者看不到任何 DB 端更新，而非單純資料重複/雜訊），修復範圍小、風險可控、不依賴 Problem B（`npo-organizations` 的 dedup/scope 決策）的討論結果，故切分為獨立規格，可先行送審與部署，不需等待姊妹 SPEC（NPO-ORGANIZATIONS-DEDUP-AND-SCOPE）的 `tax_organization` 篩選規則拍板。
