# 修法：重新啟用 news-og-backfill + 補上 TFDA 保健食品季度排程

- **Type**: Bug fix + scheduling improvement，兩個獨立子任務，同一張 ticket 一起處理。
- **Affects**: `.github/workflows/news-og-backfill.yml`, `.github/workflows/health-supplements-import.yml`
- **來源**：`docs/specs/scheduling-health-audit-20260914.md`（item 2 排程健檢報告，2026-09-14）

## 1. 子任務 A：重新啟用 `news-og-backfill.yml`，並錯開 cron

### 背景
`news-og-backfill.yml` 目前是 `disabled_manually` 狀態。稽核報告追查後判斷這**很可能是誤停用**，
不是刻意決定：
- 停用時間點（2026-08-31T00:24 UTC）落在一場 4h39m 的 NPROC/LVE Entry Process 耗盡當機
  （issue #98，23:51–04:30 UTC）中間。
- 停用前最近 30 次執行，29 次成功（停用當下那次失敗是 SSH 斷線，不是邏輯錯誤）。
- 找不到任何 issue/PR 記載「backlog 已清完，故意停用」的決策紀錄。
- 這個 workflow 自己的設計文件 `docs/specs/news-card-image-freshness-scheduling.md` 第 3 節
  明確把「一次性大批回填」跟「常態每 30 分鐘排程」分開描述——常態排程是設計上要長期存在的，
  一次性回填只是上線當天的操作步驟，不是停用整個排程的理由。

### 修法
1. 重新啟用 `news-og-backfill.yml`（`gh workflow enable news-og-backfill.yml`，或視需要用
   repo 設定介面）。
2. **重新啟用前，先把 cron 從 `*/30 * * * *` 改成跟 `facilities-geocode-batch.yml` 的
   `*/30 * * * *` 錯開的時間**（兩者目前共用 `host-tw123457-server` concurrency group 且
   `cancel-in-progress: true`，格點重疊會重演 issue #249 那個「排程存在但每次都被搶佔取消」
   的坑）。建議做法：改成 `7,37 * * * *`（每小時 :07、:37 觸發，與 geocode-batch 的 :00/:30
   保持 7 分鐘緩衝，且跟這次同步修正的 `npo-organizations-sync.yml`（:45）也不重疊）。
3. 在 cron 註解說明為何選這個時間、引用這張 ticket 與 #249 的教訓，避免未來又被以為是隨意的
   數字。
4. 重新啟用當下，可考慮先手動 `workflow_dispatch` 跑一次確認 OG 回填是否正常（若這段期間累積了
   新的 backlog）。

## 2. 子任務 B：`health-supplements-import.yml` 補上獨立季度排程

### 背景
這個 workflow 目前完全沒有 `schedule:` 觸發，只能手動觸發；workflow 自己的註解說明是「原本
搭六個月一次的 `six-monthly-sync.yml`（Jan 1 / Jul 1）跑，這個獨立版本是為了能單獨重跑而不用
連帶觸發六個月同步裡更重的 food-nutrition（~227k 筆）與 food-operators（~825k 筆）匯入」——
也就是說目前的排程節奏是設計上綁定六個月一次。

但稽核報告查證官方 `data.gov.tw/dataset/6951`（TFDA 健康食品(健字號)登錄資料集）頁面顯示其
更新頻率標示為「每 3 個月」，比目前的六個月排程更頻繁——本站目前的自動化落後官方資料更新頻率。

### 修法
1. 在 `health-supplements-import.yml` 新增獨立的 `schedule:` cron，頻率設為每季一次
   （例如每年 1、4、7、10 月各跑一次），**不要**綁在 `six-monthly-sync.yml` 現有的 Jan/Jul
   格點上（避免兩者疊加造成不必要的重複匯入），也不要跟同 concurrency group 的其他 workflow
   撞到常見的整點/半點格點。
2. 更新檔案內既有的說明註解，反映「現在有獨立季度排程，不再只靠手動或六個月同步」這件事。
3. 確認這個獨立排程與 `six-monthly-sync.yml` 內同樣匯入 TFDA 健康食品的步驟不會造成資料衝突
   （匯入邏輯本身若是 upsert/幂等，重複跑應該安全；若不是，需在 PR 描述中說明）。

## 3. 驗收
- `news-og-backfill.yml` 恢復 `active` 狀態，且新 cron 時間不與 `facilities-geocode-batch.yml`
  （:00/:30）或 `npo-organizations-sync.yml`（:45）的格點重疊。
- `health-supplements-import.yml` 有獨立季度 `schedule:`，且與 `six-monthly-sync.yml` 的
  Jan/Jul 排程不衝突。
- 兩個 workflow 檔案的 YAML 語法正確（可用既有的驗證方式確認）。
- 不改動 `facilities-geocode-batch.yml`、`npo-organizations-sync.yml` 本身（那兩個已經在
  #249／PR #250 修好，不要動）。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
