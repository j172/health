# 10 排程、同步與 CI/CD

> 合併自 7 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相

### 1.1 雙軌排程

| 軌道 | 數量 | 說明 |
|---|---|---|
| in-app node-cron（`lib/server/cron/registerJobs.ts`） | 52 個 job（2026-10-18，YouBike 拆成雙北／TDX 兩個之後） | 隨 Next.js 啟動；RSS（`5,35`）、CWA（`15,45`）、急診（`7,22,37,52`）、圖庫指派（每 10 分）、YouBike（臺北市／新北市每 5 分走開放資料；其餘 13 縣市走 TDX，`11,26,39,54`）等；每個 job 記錄記憶體用量，記憶體吃緊時降載 |
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

另有一個 in-app job（#691）：`office-calendar-sync`，`34 6 * * 3`（每週三 06:34），同步政府行政機關辦公日曆表（data.gov.tw 14718，當年＋次年）到 `office_calendar_days`；不是「每年一次」是因為人事行政總處會中途修正日曆（114 年於 2025-10-20 改了 3 天）。分鐘 34 沒有任何 job 使用。檔案來自 `www.dgpa.gov.tw/FileConversion`，正式主機與 runner 是否連得到待 `egress-probe.yml` 結果確認；連不到時頁面退回內建 seed，且失敗會寫入 `ingest_errors`。

---

## 2. 長期有效的決策

- GitHub Actions 的排程會延遲 5–15 分鐘，原本錯開的排程可能擠在一起，推高主機 NPROC；新增排程必須參考現有分鐘數錯開。
- **in-app cron 有自動 lint**（#669）：`lib/server/cron/cronCollisions.test.mjs` 解析 `registerJobs.ts` 內所有 `cron.schedule` 運算式，凍結一份「既有同 tick 配對」清單（含已知的 `30 4 * * *` green-products／wra-catalog 雙排程），**任何新 job 與既有 job 同 tick 都會讓測試失敗**，訊息會列出目前沒有任何 job 使用的分鐘。不要把新配對加進清單，換一個沒人用的分鐘。此 lint 只涵蓋 `registerJobs.ts`，GitHub Actions 的 `schedule:` 仍要人工對照本節的表。
- **RSS 匯入的重疊觸發靠同一把 MySQL advisory lock 擋住**（#699）：in-app cron（`:05/:35`）與 GitHub 心跳（admin 路由，`:20/:50`）都呼叫 `runRssIngestion`，鎖名 `rss_ingestion_lock`。一輪匯入約 11 分鐘，兩個觸發點本來就會重疊；沒搶到鎖的嘗試寫成 `ingest_runs.status='skipped'`（安靜的跳過，不是 `failed`）。先取鎖、才建立 `running` 的列。鎖綁在一條閒置一輪的 MySQL 連線上，連線被關掉鎖就無聲消失，所以匯入每個單位工作之間都用 `IS_USED_LOCK` 心跳確認，鎖丟了就停（`AdvisoryLockLostError`）。
- 長時間的行程內工作要像 `runMonitor.ts` 那樣在單位工作之間：確認鎖／更新 `updated_at` → 超過預算才強制 GC（`heapGovernor.ts`；PM2 的 `node_args` 我們不能改，所以執行期用 `v8.setFlagsFromString('--expose-gc')` 取得 `gc`）→ 寫一行 JSON 階段日誌（沿用 #697 的 `stageLog` 形狀）→ `yieldToEventLoop()`。
- **每日 TDX 樂齡軌道同步（`runTransitAccessibilitySync`，`15 3 * * *`）每個 RailSystem 抓完就寫入、可續跑**（#704）：5 req/min 共用限流下整輪約 11 分鐘，而 `health-web` 平均約每 12 分鐘被主機 SIGKILL，原本「先全部收進記憶體、最後才寫 DB」的做法永遠寫不出來（`stationMaps`／`transfers` 一直是 0）。現在邏輯在 `lib/server/transit/railSyncCore.ts`、SQL 在 `railSyncStore.ts`：一個系統抓完（county＋Facility＋Service＋Map＋Transfer）就寫，再抓下一個；站點走 `uniq_station` upsert，maps／transfers 每個系統用**一個交易**只 `DELETE … WHERE rail_system = ?` 後重插，且要過 `decideSnapshotReconcile`（抓取失敗、回空、或少於已存筆數的 50% 一律不刪、不影響其他系統）；Facility 抓失敗就不寫該系統的站點列。每系統的最後成功時間記在 `accessible_transit_sync_state`（主鍵只有 `rail_system`），下一輪**最久沒成功的系統先跑**（從未成功者排最前），所以即使每次只跑得完幾個系統，幾天內也會補齊。每步輸出一行 `{"event":"transit_accessibility_sync_stage","stage":…,"system":…,"heapUsedMB":…,"rssMB":…}`；用 MySQL advisory lock `transit_accessibility_sync_lock` 防止 admin 手動觸發與 cron 重疊。被 guard 擋下（回空／驟減）的系統不算成功，下一輪會優先重試並在 `errors[]` 留下原因。
- **YouBike 拆成兩個 job，TDX 只負責其餘 13 縣市且平常只打 Availability**（2026-10-18，#668）：`youbike-sync`（`*/5`）只讀臺北市、新北市的免費開放資料，**完全不碰 TDX**，log（`logs/youbike-sync-cron.log`）的 `source` 是 `"direct"`；`youbike-tdx-sync`（`11,26,39,54`，約每 15 分鐘，`logs/youbike-tdx-sync-cron.log`）負責 TYCG、HSC、HCH、MAL、TXG、CHA、YUN、CYI、CYQ、TNN、KHH、PTT、TTT，**`"source":"tdx"` 只會出現在這個 log**。TDX 回合（`lib/server/youbike/tdxSyncCore.ts`）每縣市只打 1 次 `Bike/Availability`，站名／地址／座標／車柱數從 `youbike_stations` 併入；只有「該縣市靜態資料從未載入或距上次載入超過 24 小時」「Availability 出現資料庫沒有的 StationID（同縣市每小時最多一次）」才補打 `Bike/Station`，每輪上限 3 次（冷啟動 13 縣市分 5 輪載完），Station 請求失敗的縣市 1 小時內不重試。「上次載入時間」存在 `youbike_sync_state`（主鍵 `city_code`，時間欄位不在任何 key 裡），行程重啟不會重載。每個批次（3 縣市）抓完就寫入。新竹市直連（`odws.hccg.gov.tw`，幾乎永遠逾時）只在 TDX 沒有新竹資料且資料庫也沒有真正的 TDX 新竹站點時才當後備，逾時 5 秒、失敗後 1 小時內不再試，且與其餘縣市同時進行。前台「更新延遲」徽章：雙北 15 分鐘、其餘縣市 30 分鐘（TDX 約每 15 分鐘一輪，一輪約 3 分鐘）。
- **TDX 全域斷路器與每日請求預算見 §2.1**；`transit-accessibility-alerts`（`16`）與 `senior-tourism-alerts`（`17`）從每 30 分鐘改為每小時，`metro-alerts` 維持每 30 分鐘。
- 共用 concurrency group 時，`cancel-in-progress: true` 會**跨 workflow** 取消別人；長時間任務不可與之同組同時段。
- 打主機 API 一律用 SSH loopback（`scripts/lib/ssh-loopback.mjs`），不打公開網址（Cloudflare 會對 runner 發 JS 挑戰）。
- Cloudflare 快取清除失敗不得中斷部署（`continue-on-error`）。
- 部署請選在 `:15–:30` 或 `:45–:00`，避免 PM2 重啟打斷正在跑的擷取。
- GitHub Actions 的 Environment secrets（`FTP_SERVER`）會覆蓋同名 Repository secrets，更新 secret 時兩層都要檢查。

### 2.1 TDX 每日請求預算、斷路器與症狀判讀（2026-10-18）

TDX 基本方案整組憑證每分鐘 5 次（`lib/server/tdx/rateLimiter.ts` 每 13 秒放行一個，理論上限 86,400 ÷ 13 ≈ **6,646 次/天**），另有點數用量；所有 in-app TDX job 共用同一個行程內限流器、同一組憑證、同一個斷路器。2026-10-15 起 token 請求被拒、收到點數用量超過 100% 的通知之後做了降載，下表是「每個 job 每輪幾個請求、一天幾次」（請求數 = 程式碼推算，不含 429 重試多送的請求；`tdx_parking`／`tdx_aps` 由半年同步觸發，一次性約 88＋22 次，不在表內）：

| job（`logs/` 下的 log 檔） | 排程 | 每輪 TDX 請求 | 每日次數（現在） | 每日次數（改前） |
|---|---|---|---|---|
| `youbike-tdx-sync-cron.log`：13 縣市 `Bike/Availability` | `11,26,39,54 * * * *` | 13 | **1,248** | — |
| 　同上，`Bike/Station` 靜態資料重載 | 每縣市約每 24 小時一次（每輪上限 3 次） | 0–3 | ≈13 | — |
| `youbike-sync-cron.log`（改前：15 縣市 × Station＋Availability；現在：臺北／新北走開放資料） | `*/5 * * * *` | 改前 30；現在 **0** | 0 | 4,320（一輪約 6.5 分鐘，重疊的 tick 被跳過，約每 10 分鐘一輪 × 144） |
| `metro-alerts-sync-cron.log`（8 個軌道系統） | `0,30 * * * *` | 8 | 384 | 384 |
| `transit-accessibility-alerts-cron.log`（10 個 RailSystem） | `16 * * * *`（改前 `16,46`） | 10 | 240 | 480 |
| `senior-tourism-alerts-cron.log` | `17 * * * *`（改前 `17,47`） | 1 | 24 | 48 |
| `transit-accessibility-sync-cron.log`（10 系統 × county／Facility／Service／Map／Transfer） | `15 3 * * *` | ≈50 | 50 | 50 |
| `senior-tourism-sync-cron.log`（Facility／Service／Package） | `20 3 * * *` | 3 | 3 | 3 |
| `senior-card-sync-cron.log`（22 縣市） | `25 3 * * *` | 22 | 22 | 22 |
| `transit-bus-sync-cron.log`（22 縣市 × Vehicle／Schedule） | `30 3 * * *` | 44 | 44 | 44 |
| **合計** | | | **≈2,028**（占理論上限約 31%） | **≈5,351**（約 81%） |

YouBike 一項就從 4,320 降到 ≈1,261（−71%）。這張表是靠程式碼推算的名目值，上線後以各 log 的 `summary.tdx.availabilityCalls`／`stationCalls`（YouBike）與 `[tdx-breaker]` 行核對。

**斷路器**（`lib/server/tdx/circuitBreaker.ts`，行程內 singleton，由 `getTdxToken()` 與 `tdxGetJsonWithRetry()` 共用，不放寬共用限流器）：

- **開啟條件**：token 請求拿到非 200 的 HTTP 回應（含 400 `unauthorized_client`／`invalid_client`、401／403／429、5xx）；API 的 429 在 `tdxGetJsonWithRetry` 用盡重試（3 次）後仍是 429；429 的 `ratelimit-reset` 大於 120 秒（不可能是每分鐘節流，視為配額視窗，不重試、也不餵給限流器）；API 回 403。
- **不會開啟**：逾時／連線重設等沒有 HTTP 回應的錯誤、401、5xx、404（避免一次網路抖動讓 `03:15–03:30` 的每日同步整批停擺）。
- **開啟期間**：`getTdxToken()` 直接回 `null`（連快取中的 token 也不給），所有呼叫端走本來就有的降級路徑；`tdxGetJsonWithRetry` 回 `{ status: 503, circuitOpen: true }`，不送出任何請求，各 client 的錯誤訊息會多一句 `(circuit breaker open, nothing was sent)`。
- **退避**：15 分鐘 → 30 分鐘 → 60 分鐘（上限 60 分鐘）。到期後只放**一次**探測（half-open）：探測期間其他請求仍被擋；探測成功立即關閉並重置退避；探測失敗升級到下一級。探測請求若逾 5 分鐘沒回報，允許下一個請求接手。
- **只存在行程記憶體**：重啟 `health-web` = 回到 closed，第一個請求會立刻重新判斷一次；憑證或配額恢復後不需要人工介入，最慢 60 分鐘內探測成功自動關閉。
- **日誌**：每次狀態轉換一行 `[tdx-breaker] OPEN for 15 min (reason: …)`／`HALF-OPEN`／`CLOSED`，只有狀態與時間，不含憑證。

**症狀與判讀**——先分清楚是「token 端」還是「API 端」，兩者原因與處置不同，**不要把「token 失敗」直接等同於「點數超額」**：

| 日誌裡看到 | 意義 | 處置 |
|---|---|---|
| `TDX token request rejected: HTTP 400, error=unauthorized_client, description=Invalid client credentials`（或 `invalid_client`；每 10 分鐘最多一行） | token 端點認得這個 client，但**拒絕這組憑證**：憑證被停用或 secret 已更換。不是每分鐘限流，也不是 API 點數 | 到 TDX 會員中心確認 client 狀態，更新主機 `.env` 的 `TDX_CLIENT_SECRET`（不要把 secret 貼進對話或日誌），再重啟 `health-web` |
| 各 cron log：`TDX token unavailable (not configured, or the token request itself failed)`、`TDX credentials missing or token request failed — nothing was fetched` | 拿不到 token（沒設憑證、被拒，或斷路器開啟） | 看同時間有沒有上一列的 `token request rejected` 與 `[tdx-breaker]` 行判斷是哪一種 |
| 公車／軌道等 log：`… returned status 429`，且 `[tdx-breaker] OPEN … (reason: rate_limited)` | API 端的每分鐘節流在重試後仍被拒；偶發是正常的（共用限流器會排隊），連續出現代表呼叫量超過 5 次/分鐘的承載 | 檢查同一時段有哪些 job 同時跑（上表），必要時錯開排程 |
| `[tdx-breaker] OPEN … (reason: quota_exceeded)`（429 且 `ratelimit-reset` > 120 秒） | API 端**配額／點數用盡**（TDX 另會寄「虛擬點數用量超過 100%」通知信） | 降低請求量（上表）、到 TDX 確認點數與方案；用量視窗過後探測會自動恢復 |
| `… returned status 503 (circuit breaker open, nothing was sent)` | 斷路器擋下的呼叫，**沒有**送到 TDX | 不是 TDX 在回 503；找 `[tdx-breaker] OPEN` 那一行看原因 |
| `youbike-tdx-sync-cron.log` 的 `summary.errors` 出現 `TDX unavailable (…)` | 13 縣市本輪完全沒更新（臺北／新北不受影響，走開放資料） | 同上；YouBike 前台這些縣市會標「更新延遲」 |

斷路器開啟時受影響的功能：YouBike 其餘 13 縣市停止更新、軌道告警、無障礙設施告警、樂齡觀光告警、公車低地板日同步降級；臺北市與新北市 YouBike 不受影響。

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
- YouBike（原為每 5 分；2026-10-18 起臺北市／新北市每 5 分走開放資料，其餘 13 縣市走 TDX 約每 15 分，見 §2、§2.1）、捷運公告（每 30 分、Big5 CSV）、病蟲害（每 6 小時）、書籍排行；超過 15 分鐘（TDX 縣市為 30 分鐘）未更新前台標「更新延遲」。

#### 部署快取清除與半年同步強化 ✅
- 原檔：[ci-deploy-and-sync-resilience.md](../archive/specs/ci-deploy-and-sync-resilience.md)（#229、#224）
- Cloudflare 401 曾讓部署後 20 多個步驟全部跳過；半年同步的 `ssh -L` tunnel 被主機禁止，改為 SSH 遠端執行 curl。
