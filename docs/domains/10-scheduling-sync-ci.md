# 10 排程、同步與 CI/CD

> 合併自 7 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相

### 1.1 雙軌排程

| 軌道 | 數量 | 說明 |
|---|---|---|
| in-app node-cron（`lib/server/cron/registerJobs.ts`） | 36 個 job（2026-10-10 TDX 同步加入後） | 隨 Next.js 啟動；RSS（`5,35`）、CWA（`15,45`）、急診（`7,22,37,52`）、圖庫指派（每 10 分）、YouBike（每 5 分）等；每個 job 記錄記憶體用量，記憶體吃緊時降載 |
| GitHub Actions | 14 個 workflow | 需要外部 IP（被主機封鎖的上游）、長時間批次、或部署相關的工作；透過 SSH 在主機上執行，**不走 TCP 轉發**（HawkHost 已關閉 `AllowTcpForwarding`） |
| 系統 crontab | 1 個 | 只保留 `pm2-ensure-running` 自我修復 watchdog |

### 1.2 GitHub Actions 排程表（2026-10-12）

| Workflow | 排程 | 備註 |
|---|---|---|
| `facilities-geocode-batch.yml` | `*/30 * * * *` | 共用 concurrency group `host-tw123457-server` |
| `news-og-backfill.yml` | `10,40 * * * *` | runner 抓圖、SSH loopback 回寫（#336 錯開） |
| `rss-sync-manual.yml` | `20,50 * * * *` | 外部心跳，搭配 in-app 排程（#336 錯開） |
| `npo-organizations-sync.yml` | `45 3,15 * * *` | 不再與 geocode 的 `:00/:30` 相撞 |
| `disaster-points-sync.yml` | `25 4 * * *` | 每日 |
| `medical-violators-sync.yml` | `25 3 * * 0` | 每週日 |
| `opendata-geo-backfill.yml` | `13 18 8 * *` | 每月 8 日 |
| `health-supplements-import.yml` | `15 5 15 1,4,7,10 *` | 每季 |
| `six-monthly-sync.yml` | `45 19 1 1,7 *` | 1 月、7 月 |
| `deploy-ftps.yml` | **僅手動觸發**（`workflow_dispatch`） | merge 到 main 不會自動部署 |
| `egress-probe.yml`、`php-lint.yml`、`cloudflare-config.yml`、`purge-cloudflare-cache.yml` | 手動／觸發式 | — |

---

## 2. 長期有效的決策

- GitHub Actions 的排程會延遲 5–15 分鐘，原本錯開的排程可能擠在一起，推高主機 NPROC；新增排程必須參考現有分鐘數錯開。
- 共用 concurrency group 時，`cancel-in-progress: true` 會**跨 workflow** 取消別人；長時間任務不可與之同組同時段。
- 打主機 API 一律用 SSH loopback（`scripts/lib/ssh-loopback.mjs`），不打公開網址（Cloudflare 會對 runner 發 JS 挑戰）。
- Cloudflare 快取清除失敗不得中斷部署（`continue-on-error`）。
- 部署請選在 `:15–:30` 或 `:45–:00`，避免 PM2 重啟打斷正在跑的擷取。
- GitHub Actions 的 Environment secrets（`FTP_SERVER`）會覆蓋同名 Repository secrets，更新 secret 時兩層都要檢查。

---

## 3. 核對後仍未完成的項目

無。排程碰撞問題已於 #336 處理；後續若新增排程請依 §2 規則錯開。

---

## 4. 逐份紀錄

#### In-app cron 排程器（node-cron） ✅
- 原檔：[in-app-cron-scheduler.md](../archive/specs/in-app-cron-scheduler.md)
- 原本 4 個系統 crontab 項目透過 SSH 安裝、以 curl 打 loopback；改在 Next.js 行程內排程，去除部署時安裝 crontab 的依賴。watchdog 留在系統 crontab。

#### 每個 cron job 的記憶體監控 ✅
- 原檔：[cron-memory-monitoring.md](../archive/specs/cron-memory-monitoring.md)
- 2026-09-23 WASM OOM 崩潰迴圈在三個無關 bug 修完後仍持續；為 25+ 個 job 記錄每次執行前後記憶體，找出峰值來源。

#### GitHub Actions 排程去重疊 ✅
- 原檔：[github-actions-cron-decollision.md](../archive/specs/github-actions-cron-decollision.md)（#336）
- SSH 證據：load average 長期 10–12（共享主機其他租戶），process 數在排程群聚時衝到 40–46。重新分配各 workflow 的分鐘數。

#### 排程健康度稽核（2026-09-14） 📚
- 原檔：[scheduling-health-audit-20260914.md](../archive/specs/scheduling-health-audit-20260914.md)
- 盤點當時 10 個 workflow 的頻率、concurrency 與近期執行結果；發現 NPO 同步連續 5 次被取消（#249）、半年同步的 tunnel 失效（#224）。

#### NPO 同步被 geocode 批次搶佔取消 ✅
- 原檔：[npo-sync-concurrency-starvation-fix.md](../archive/specs/npo-sync-concurrency-starvation-fix.md)（#249）
- NPO 同步固定在 `:30` 起跑，正好撞上 geocode 的 `*/30`，跑 34 秒就被取消、長期停擺；改時段並調整 concurrency。

#### 即時資料排程入庫與部署驗證 ✅
- 原檔：[realtime-sync-scheduler-and-pipeline-resilience.md](../archive/specs/realtime-sync-scheduler-and-pipeline-resilience.md)（#213）
- YouBike（每 5 分）、捷運公告（每 30 分、Big5 CSV）、病蟲害（每 6 小時）、書籍排行；超過 15 分鐘未更新前台標「更新延遲」。

#### 部署快取清除與半年同步強化 ✅
- 原檔：[ci-deploy-and-sync-resilience.md](../archive/specs/ci-deploy-and-sync-resilience.md)（#229、#224）
- Cloudflare 401 曾讓部署後 20 多個步驟全部跳過；半年同步的 `ssh -L` tunnel 被主機禁止，改為 SSH 遠端執行 curl。
