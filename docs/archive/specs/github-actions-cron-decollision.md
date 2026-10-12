# GitHub Actions 排程去重疊規格書

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應使用者回報**：「各頁面載入速度有點慢」「網站似乎很不穩定」「查看所有資料來源排程是否合理」

## 1. 診斷證據（已完成，SSH 讀取生產主機）

生產主機（HawkHost 共享主機 `103.21.221.12`，帳號 `tw123457`）現況：

- `uptime` 顯示 load average 持續 10~12（觀測跨 5 天），但帳號自己的 process（`top -bn1`，僅 10 個 task）幾乎全部 0% CPU、`wa`（iowait）恆為 0.0。這是 CloudLinux LVE 共享主機的 CPU 排隊/節流症狀（其他租戶搶主機的 CPU 時間片），不是本站程式碼造成的效能問題。
- `~/health_app/.pm2-watchdog.log` 顯示 process 數（`nproc-gate`）在同一小時內數次衝到 40~46（ceiling 35，實體帳號 NPROC 上限 100），時間點與下列 GitHub Actions 排程觸發群聚重疊：
  - `facilities-geocode-batch.yml`：`*/30 * * * *`
  - `news-og-backfill.yml`：`7,37 * * * *`
  - `rss-sync-manual.yml`：`18,48 * * * *`
  - 這幾支 workflow 都會透過 SSH 連線到主機、在遠端 spawn node/curl process（見 `scripts/lib/ssh-bridge.mjs`、`scripts/lib/ssh-loopback.mjs`）。GitHub Actions 排程本身有數分鐘的觸發延遲（`gh run list` 顯示的實際 `createdAt` 常比 cron 設定的分鐘數晚 5~15 分鐘），使得原本間隔開的排程在實際執行時常常擠在同一個 5~10 分鐘窗口內，疊加推高帳號的 process 數與主機負載。
- Watchdog 目前的行為是正確的（`nproc-gate` 擋下自己的 escalation，避免火上加油），但沒有解決「排程本身群聚」這個根因。

## 2. 目標

降低同一時間窗口內、會經 SSH 連線主機的排程數量與頻率群聚，減少 NPROC 尖峰與主機瞬時負載，改善「載入變慢／偶爾不穩定」的體感。

**非目標**：不處理共享主機的「吵鬧鄰居」CPU 節流本身（廠商層級問題，非本站可控；如需徹底解決需換主機方案，超出本工單範圍，僅在報告中註記）。

## 3. 待辦事項（實作者需先盤點再動手，數字僅供參考）

1. 盤點 `.github/workflows/*.yml` 中所有帶 `schedule:`/`cron:` 的 workflow（目前已知至少 11 支：`facilities-geocode-batch`、`news-og-backfill`、`rss-sync-manual`、`opendata-geo-backfill`、`health-supplements-import`、`npo-organizations-sync`、`disaster-points-sync` 等），列出各自的 cron 分鐘數與是否會經 SSH 連到 `103.21.221.12`。
2. 找出目前分鐘數會互相靠太近（例如同落在同一個 10 分鐘窗口）的組合，重新分配 cron 分鐘數讓「會 SSH 連主機」的排程盡量錯開（例如彼此至少間隔 10~15 分鐘的偏移量），維持各自原本的頻率（不要單方面拉長使用者依賴的更新頻率，除非確認該資料源本來就不需要那麼頻繁——如需調整頻率，於 PR 說明中列出理由供人工複核）。
3. 確認每一支會 SSH 連主機的 workflow 都有 `concurrency:` 群組設定，避免同一支 workflow 因排程延遲疊加造成同工作流程重複執行（部分 workflow 可能已有此設定，需逐一確認而非假設）。
4. 部署時機規則：**不要**把本次變更本身安排在 `:15–:30` 或 `:45–:00` 以外的時間 merge/deploy（見專案既有規則，避免 PM2 重啟砍到跑一半的排程）；本工單只是改 workflow YAML 的 cron 設定，merge 後對 GitHub Actions 立即生效，不需要額外觸發 `deploy-ftps.yml`。

## 4. 驗收標準

- 修改後的 cron 分鐘數之間，任兩支「會 SSH 連主機」的 workflow 開始時間不應落在同一個 10 分鐘窗口內（以 cron 設定值計算，不含 GitHub 排程延遲）。
- `npm test`（若有涉及 workflow 設定的測試，例如既有的 cron/schedule 健檢測試）需通過。
- PR 說明需附上「調整前 vs 調整後」的排程時間表，方便人工複核。

## 5. 交付物

- 修改相關 `.github/workflows/*.yml` 的 `cron:` 值與（如缺漏）補上 `concurrency:` 區塊。
- 一份簡短的排程時間表（可直接寫在 PR 說明或本文件附錄），列出所有排程 workflow 的新舊 cron 值。
