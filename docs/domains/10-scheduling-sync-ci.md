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

### 1.3 半年人工匯入清單（住宅網路手動執行）

這些來源屬於 `*.mohw.gov.tw` 家族：2026-10-15 的 egress probe 證實**正式主機與 GitHub runner 兩邊都逾時**（IP 範圍封鎖，不是程式問題），所以放不進 `six-monthly-sync.yml`，也**不蓋 runner relay**（runner 同樣被擋；擁有者決議 Track B spec §7.1 D7）。做法是每約 6 個月（1 月、7 月 `six-monthly-sync.yml` 跑完之後）由人從住宅／辦公室網路手動執行下列腳本。腳本都從環境變數 `ADMIN_SECRET`（= production 的 `x-rss-sync-admin-secret`）取得密鑰，只出現在那一次指令的環境裡，不寫進任何檔案、不貼進對話或 log。

| 腳本 | 上游 | 寫入 |
|---|---|---|
| `scripts/import-mohw-ltc-gis.mjs` | ltcpgis.mohw.gov.tw（10 份長照 CSV） | `long_term_care`（`mohw_ltc_full` 及失智／家庭照顧者／社區關懷據點等子來源） |
| `scripts/import-mohw-facilities.mjs` | ltcpap.mohw.gov.tw `hpa.csv` | `health_check` |
| `scripts/import-mohw-disability-welfare.mjs` | opendata.mohw.gov.tw | `disability_welfare` |
| `scripts/import-mohw-elder-welfare.mjs` | opendata.mohw.gov.tw | `elder_welfare` |
| `scripts/import-mohw-social-welfare-centers.mjs`（160903） | opendata.mohw.gov.tw | `social_welfare_center` |
| `scripts/import-nhplatform-nursing-institutions.mjs`（115950，#678） | nhplatform.mohw.gov.tw 全國開業護理機構清冊 | `postpartum_care`（`nhplatform_115950_postpartum`）＋ `long_term_care`（`nhplatform_115950_ltc`，一般護理之家／居家護理所） |
| `scripts/import-police-stations-5958.mjs`（5958，#677） | www.tgos.tw 警政署派出所 ZIP（正式主機與 runner 皆 403；不是 mohw 家族，處置相同） | `police_station`（`police_station_5958`；`/nearby`「更多類型」→ 派出所／警察局） |

115950 的操作步驟（在 repo 根目錄、住宅／辦公室網路）：

1. 先試跑：`node scripts/import-nhplatform-nursing-institutions.mjs --dry-run`（只下載＋解析並印出筆數，不需密鑰、不送出任何東西）。預期約 1,494 列：產後護理之家 241、其餘約 1,253 筆併入 `long_term_care`。
2. 正式匯入：`ADMIN_SECRET=<密鑰> node scripts/import-nhplatform-nursing-institutions.mjs`。每 500 筆一批 POST 到 `/api/admin/facilities-import`，遇到暫時性 502／逾時會指數退避重試；最後會自動讀公開 API 核對 production 的筆數，低於剛匯入的筆數會印 `WARNING` 並以結束碼 2 結束。
3. 若住宅網路也下載不到，可用瀏覽器從 <https://data.gov.tw/dataset/115950> 另存 CSV，再加 `--file <路徑>`。
4. 匯入只做 upsert，**不會刪除**已從名冊消失（歇業）的機構；舊列會留著直到另行清理。
5. `/tools/postpartum-care` 與 `/tools/long-term-care` 的「一般護理之家／居家護理所」分類會顯示「資料日期」（該來源在本站最近一次匯入的日期）；表內沒有任何一列時顯示「資料暫缺」，不會假裝附近沒有機構（`lib/format/facilityDataStatus.ts`）。

5958 派出所的操作步驟（#677；`www.tgos.tw` 對主機與 runner 都回 403，從住宅網路各種 User-Agent／Referer 都是 200，所以是 IP 範圍封鎖而非標頭問題）：

1. 先試跑：`node scripts/import-police-stations-5958.mjs --dry-run`（先打 `data.gov.tw` 解析 API 取最新 ZIP 網址——檔名帶發布日，每次都會變——再下載、解析並印出筆數、資料日期與澎湖／金門／連江各 3 筆座標；不需密鑰、不送出任何東西）。預期 1,687 筆、座標 1,687 筆；筆數低於 1,000 或缺座標超過 2% 會拒絕繼續。
2. 正式匯入：`ADMIN_SECRET=<密鑰> node scripts/import-police-stations-5958.mjs`（密鑰只從環境變數讀、不印出、不落地）。預設一次 POST 到 `/api/admin/facilities-import`（2,000 筆一批，連續 502／504 由 `scripts/lib/facilities-import-batches.mjs` 指數退避重試），且**在第一批先刪掉既有的 `police_station` 列**，避免改名或裁撤的單位殘留（檔案沒有穩定 ID，身分是「單位名稱＋地址」）；只想 upsert 不刪舊列時加 `--no-clean`。匯入後會自動讀公開 API（`/api/facilities?type=police_station`，附時間戳避開邊緣快取）核對 production 的筆數，低於剛匯入的筆數會印 `WARNING` 並以結束碼 2 結束（`--no-verify` 可略過）。
3. 若住宅網路也被擋，可用瀏覽器從 <https://data.gov.tw/dataset/5958> 另存 ZIP，再加 `--zip <路徑>`。
4. 每列的 `extra_json.dataAsOf` 是檔名裡的發布日（如 `1150930` → 2026-09-30），`/nearby` 的派出所卡片會顯示「資料日期」與資料來源。

---

## 2. 長期有效的決策

- GitHub Actions 的排程會延遲 5–15 分鐘，原本錯開的排程可能擠在一起，推高主機 NPROC；新增排程必須參考現有分鐘數錯開。
- **in-app cron 有自動 lint**（#669）：`lib/server/cron/cronCollisions.test.mjs` 解析 `registerJobs.ts` 內所有 `cron.schedule` 運算式，凍結一份「既有同 tick 配對」清單（含已知的 `30 4 * * *` green-products／wra-catalog 雙排程），**任何新 job 與既有 job 同 tick 都會讓測試失敗**，訊息會列出目前沒有任何 job 使用的分鐘。不要把新配對加進清單，換一個沒人用的分鐘。此 lint 只涵蓋 `registerJobs.ts`，GitHub Actions 的 `schedule:` 仍要人工對照本節的表。
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
