# 11 主機、維運與事故

> 合併自 14 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相：主機硬限制

| 項目 | 值 |
|---|---|
| 主機 | HawkHost 共享主機（新加坡），CloudLinux 8＋LiteSpeed＋MariaDB 10.11＋cPanel；與 `bid.j172.tw` 共用同一帳號 |
| 行程 | PM2 v7（`health-web`），Node **v20.20.2**（nvm；**2026-10-16 從 Node 24 回滾**,見 #481：本帳號對行程的位址空間上限（RLIMIT_AS）是 **2 GiB**,Node 24.19 閒置虛擬記憶體 1.29 GB、Node 20.20.2 只有 0.74 GB,Node 24 實際生效（#634 之後,2026-10-15）起 `health-web` 每小時被 SIGABRT 中止 10–25 次（「Committing semi space failed」,堆積才約 300 MB）。要再升 Node 24 前必須先在主機量測閒置 `ps -o vsz` 與執行中行程的 `VmPeak`）,`--max-old-space-size=768`、`max_memory_restart: 1024M`；`ecosystem.config.cjs` 釘住的 interpreter 就是每次部署會套用的版本 |
| CloudLinux 限制 | 帳號（LVE `lve2004`）**實體記憶體 PMEM 只有 1 GB**（SIGKILL 的真正原因，見 1.3）、**NPROC 100**、**Entry Processes 20**（兩者不同；NPROC／EP 耗盡是另一種事故）；完整限額表見 1.3 |
| 前端 CDN | Cloudflare Free（Full Strict、Smart Tiered Cache、Bot Fight Mode） |
| 部署 | GitHub Actions 建置 → FTPS 上傳 prebuilt；`next.config.js` 也必須上傳（`next start` 從工作目錄讀取） |
| 自我修復 | `.remote-health-index.php`：每 5 分鐘 `pm2-ensure-running`（以 `fsockopen` 探測 port 3000，不 fork），探測失敗後先做約 25 秒的**寬限重探測**（見 4.1「Watchdog 在 PM2 自動拉起的空窗誤判離線」），仍不通才升級；`/__ops/*` 維運端點 |

### 1.1 這台主機絕對不能做的事
1. **伺服器端用全域 `fetch()`**：undici 會即時編譯 WASM llhttp，在虛擬記憶體限制下 `WebAssembly.instantiate()` OOM → 502。一律用 `lib/server/net/httpClient.ts`（測試強制）。
2. **請求當下做 WASM 渲染**（例如 `next/og` 的 ImageResponse）。
3. **啟用 Next.js 圖片最佳化**：數十張圖同時縮放會衝破 768MB → 全域 `images.unoptimized: true`。
4. **在主機上 `npm ci`**：會產生大量行程拖垮 NPROC；改為上傳預先建置好的產物。
5. **用管線改寫正式 crontab**（`crontab -l | sed | crontab -` 曾清空整份 crontab）。
6. **把 `ca:` 清單塞進 `https.Agent`／請求選項**：`ca` 只會被轉交給 `tls.connect()`，而它**每條連線都重建一個 `SecureContext`**（約 0.8 MB 原生記憶體，`process.memoryUsage().external` 幾乎不動，V8 看不到、不會因此做 GC）。實測 150 條連線 +118 MB RSS；改傳「預先建好、共用的 `secureContext`」同樣 150 條只 +4 MB（#699）。`httpClient.ts` 已改成模組載入時建一次，`lib/server/net/httpClient.limits.test.mjs` 會擋回頭。
7. **用 cheerio 為整頁文章建 DOM 只為了讀 `<meta>`**：parse5 的 DOM 約為原始 HTML 的 **50 倍**（500 KB 頁面活著 26 MB、1.5 MB 頁面 73 MB，另有等量以上的垃圾）。取 og:image 只讀頁面前 256 KB 並只解析 `<head>`（`extractOpenGraphCandidates`）；詳情頁先剝 `<script>`／`<style>`、超過 `DETAIL_PAGE_MAX_CHARS` 就放棄。

### 1.2 Node 版本回滾步驟（#481）
正式主機（103.21.221.12，帳號 `tw123457`）`~/.nvm/versions/node/` 同時裝有 v20.20.2（回滾用）與 v24.19.0（2026-10-13 切換後的正式版本）。PM2 的 `exec_interpreter` 是切換時明確指定的絕對路徑，**不是**從 `nvm alias default` 動態解析——所以回滾不能只改 default alias，要直接指定回舊路徑：
1. `pm2 restart health-web --interpreter /home/tw123457/.nvm/versions/node/v20.20.2/bin/node --update-env`
2. 用 `readlink -f /proc/<pid>/exe` 確認真的切回 v20.20.2（`ps -ef | grep next-server` 先找 PID，注意同帳號下還有 `mall` app，務必用 `/proc/<pid>/cwd` 或 `PORT` 確認是 health-web 不是 mall，2026-10-13 曾因為沒確認錯殺過 mall 的行程）
3. 回報 #481，記錄回滾原因

切換當天（2026-10-13）的實測基準：Node 24 下 `/`、`/news`、`/api/aqi`、`/api/accessible-transit` 等頁面/API 皆正常，RSS 約 370MB（50 秒內，有真實流量），跟 v20.20.2 時期的量級一致。

### 1.3 CloudLinux LVE 限額與 #709（SIGKILL）根因（2026-10-18）

> 狀態：🟡 **根因已知，記憶體尚未降下來**。這一節只記錄證據與判讀方法，不代表 #709 已解決；降常駐量的做法（`max_memory_restart`、`--max-old-space-size`、PM2 重啟間隔等）使用者尚未授權，這份文件也沒有改 `ecosystem.config.cjs`。

**本帳號（`tw123457`，LVE `lve2004`）的限額**（cPanel → Resource Usage 顯示）：

| 資源 | 上限 | 超過時的行為 |
|---|---|---|
| SPEED（CPU） | 100% | 節流（變慢），**不砍行程** |
| **PMEM（實體記憶體）** | **1 GB** | **超過就 SIGKILL 帳號內的行程（= `health-web` 被外部 SIGKILL）** |
| IO | 15 MB/s | 節流，**不砍行程** |
| IOPS | 5120 | 節流 |
| NPROC | 100 | 無法 fork（`EAGAIN`），見 4.1 |
| Entry Processes（EP） | 20 | 請求被拒（503），見 4.1 |
| inodes | 500000 | 無法建立檔案 |

**證據**（cPanel Resource Usage，2026-10-18 台北時間 08:00–21:00）：
- Faults：**PMEM 22**、CPU 33、IO 52；NPROC（用 46／上限 100）、Entry Processes（上限 20）、IOPS（上限 5120）**全部 0 fault**。CPU／IO 的 fault 是節流，不會砍行程，所以排除。
- 逐小時對照：每個小時的 PMEM faults 與 `~/.pm2/pm2.log` 內 `exited with code [0] via signal [SIGKILL]` 的次數，**13 個小時裡有 11 個小時完全相同**。→ 每一次 PMEM fault 就是一次 SIGKILL。
- 每小時**平均** PMEM 只有 580–730 MB，所以 fault 來自小時內的**短暫尖峰**（平均看不到，5 分鐘一行的 `proc_resources` 也容易漏掉）。
- 帳號內的行程：`health-web`（Next，約 450–600 MB，cwd `~/health_app`）、`mall`（另一個 Next app，cwd `~/mall_app`，**不在本 repo**）、PM2 God Daemon、`pm2-logrotate`（常駐約 45–55 MB，已決定移除，見 4.2）、`lsphp`。PMEM 是**帳號內所有行程加總**，所以 `mall` 或 PM2 本身漲上去，也會讓 `health-web` 被砍。

**怎麼在 cPanel 重現這個對照**：
1. cPanel → Metrics → **Resource Usage** → **Current usage**（或 Details），選逐小時，看 **Physical Memory Usage** 那一列的 **Faults**；其他資源（CPU、IO、IOPS、NPROC、EP）同一頁看。
2. 主機上數同一小時的 SIGKILL：`grep 'via signal \[SIGKILL\]' ~/.pm2/pm2.log | cut -c1-13 | sort | uniq -c`（假設每行以 ISO 時間戳開頭，`cut` 取到「小時」；實際格式以檔案為準）。
3. 兩邊的**時區可能不同**（先前事故紀錄用 UTC，cPanel 這次用台北時間 = UTC+8），對照前先換算成同一個時區。
4. `pm2.log` 是分析 SIGKILL 的唯一來源，**不能被輪替掉或丟掉**（4.2 的保留期 job 只在它超過 8 MB 時 copytruncate，並保留 7 天的輪替檔）。

**接下來**：降低記憶體前，先靠 4.2「尖峰與逐行程組成」新增的欄位（`proc_resources_spike`、`acctRssPeakMB`、`procs`）找出尖峰是誰造成的，再決定要降哪一個。

---

## 2. 長期有效的決策

- 恢復機制本身不得成為負載：任何修復動作都要先檢查 NPROC，並驗證 kill 真的生效。
- 判斷「哪個 PM2 God Daemon 是活的」**不得信任 `~/.pm2/pm2.pid`**；以「實際管理活著的 next-server 的祖先鏈」為準。
- `reap-stragglers` 的 dry-run 結果不可單獨作為下 `apply=1` 的依據（2026-09-20 曾因此殺掉真正的 daemon）。
- 主機上已停用 redis 與 memcached（`~/.applicationmanager/applications.json`），常態 5 個行程。

---

## 3. 核對後仍未完成的項目

| # | 項目 | 說明 |
|---|---|---|
| O-1 | ~~httpClient 每次 HTTPS 連線都重建 TLS SecureContext~~（#401；#699 修正，待上線驗證） | 先前加的共用 keep-alive `https.Agent` **沒有**解決它：`ca` 選項只被轉交給 `tls.connect()`，仍是每條連線一個 context。#699 改成模組載入時 `tls.createSecureContext({ ca })` 建一次、以 `secureContext` 傳給 Agent，並讓閒置 socket 10 秒後關閉。上線後觀察 `std::bad_alloc`（`AddCACert`）是否消失，再關 #401 |
| O-2 | Issue #391（雙 God Daemon）、#394（`_next/image` OOM）仍為 OPEN | 修正已上線，issue 待驗證後關閉 |
| O-3 | Node 20 已 EOL，但正式主機**暫時留在 v20.20.2** | 2026-10-13 曾嘗試切到 v24.19.0（#481），但 2026-10-15 `ecosystem.config.cjs` 把 24 釘住後，`health-web` 每小時 SIGABRT 10–25 次：本帳號對行程的位址空間上限（RLIMIT_AS）是 **2 GiB**，Node 24 閒置虛擬記憶體 1.29 GB、Node 20 只有 0.74 GB，少了約 550 MB 餘裕，V8 在堆積約 300 MB 時就撞上限。**2026-10-16 已回滾到 v20.20.2（PR #700）**；回滾後 SIGABRT 為 0。再升級前必須先在主機量測：閒置 `ps -o vsz` 與執行中行程的 `VmPeak` 要有明確餘裕（建議 `VmPeak` < 1.6 GB；Node 20 目前就已 1.7–1.9 GB）。CI 仍用 Node 24 建置，與主機執行環境不同。#481 維持開啟 |
| O-4 | 共享主機鄰居搶 CPU | 主機層級問題，非程式可解；load average 長期 10–12 |
| O-5 | `health-web` 約每 15–35 分鐘被外部 SIGKILL，原因不明（#709） | 一開始以為只砍 `health-web`，但 2026-10-17 10:13–10:14 UTC 同帳號 mall 也同時被砍 5 次（50 秒內 `health-web` 被砍 7 次）→ 帳號層級（CloudLinux LVE `/lve2004`）管控；`health-web` RSS 約 430–630 MB、`VmPeak` 1.7–1.9 GB（`RLIMIT_AS` 2 GiB）。#707 只縮短中斷時間，沒有減少被砍次數。第一步是 `proc_resources` 日誌（見 4.2「health-web 每 5 分鐘一行資源日誌」），上線累積幾次被砍之後，依「死前 5 分鐘」趨勢判斷是位址空間、實體記憶體還是行程／fd 數；#709 保持開啟。**2026-10-18 更新：根因已用 cPanel Resource Usage 證實是帳號實體記憶體（PMEM）上限只有 1 GB，每次 PMEM fault 就是一次 SIGKILL（見 1.3）；記憶體尚未降下來。** 下一步：①用 `proc_resources_spike`／`acctRssPeakMB`／`procs` 找出短暫尖峰是誰造成的（見 4.2「尖峰與逐行程組成」）；②`pm2-logrotate`（常駐 45–55 MB）已決定移除，改由 app 內每日 job 做日誌保留期（見 4.2）；③`mall` 的日誌量很小（合計約 76 KB），移除 `pm2-logrotate` 後不需處理，日後成長再議（見 4.2） |

---

## 4. 逐份紀錄

### 4.1 NPROC 與 PM2

#### 停止在主機上 npm ci、阻斷 NPROC 連鎖 ✅
- 原檔：[SPEC-HEALTH-20260907-P1P2-NPROC-RESILIENCE.md](../archive/specs/SPEC-HEALTH-20260907-P1P2-NPROC-RESILIENCE.md)
- 2026-09-07 部署時 LiteSpeed 503：主機端同步 node_modules 撞到 NPROC 100／EP 20。改為完全預建置上傳；geocode 與 OG 回填 workflow 也調整為不在主機產生大量行程。

#### 阻止 PM2 daemon 增生耗盡 NPROC ✅
- 原檔：[pm2-daemon-proliferation.md](../archive/specs/pm2-daemon-proliferation.md)（#74、#75、#97；2026-10-07 正式環境驗證）
- 2026-08-31 停機約 4 小時 39 分；watchdog 的失敗路徑每次升級會 fork 5 個行程，且每次 `pm2` 指令都可能生出新 daemon。

#### 恢復機制成為負載的三種方式 ✅
- 原檔：[recovery-mechanism-as-load.md](../archive/specs/recovery-mechanism-as-load.md)（#97、#98）
- 存活檢查把已 kill 未回收的殭屍當成活著（`/proc/<pid>` 仍存在）、天花板值設定、探測預算；三者同在一檔，一次修完避免 PM2 重啟三次。

#### 阻斷 PM2 恢復放大 NPROC 耗盡 ✅
- 原檔：[SPEC-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md](../archive/specs/SPEC-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md)、工單 [TICKET-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md](../archive/tickets/TICKET-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md)（#426）
- `EAGAIN: pthread_create` 發生在行程上限邊緣；新增 `.pm2-recovery-guard.php` 與 `php-lint.yml`。

#### 雙 God Daemon 孤兒清理＋擷取記憶體峰值降低 ✅（#391 待關閉）
- 原檔：[pm2-duplicate-daemon-and-ingestion-memory.md](../archive/specs/pm2-duplicate-daemon-and-ingestion-memory.md)（PR #388、#390）
- `$godPid` 信任 `pm2.pid` 而未與保護清單交叉比對 → 兩顆 daemon 都被永久保護；`pm2-logrotate` 清掉又在錯的 daemon 下重生。

#### Watchdog 在 PM2 v7 永遠找不到 God Daemon ✅
- 原檔：[watchdog-god-daemon-cmdline-match-bug.md](../archive/specs/watchdog-god-daemon-cmdline-match-bug.md)（#368、PR #369）
- 只比對 cmdline 含 `Daemon.js`，但 v7 的行程標題是 `PM2 v7.0.3: God Daemon (...)` → 每次事故都是 `candidates=0`。

#### reapStragglers 必須保護活著 app 的祖先 ✅
- 原檔：[watchdog-reap-must-protect-live-app-ancestors.md](../archive/specs/watchdog-reap-must-protect-live-app-ancestors.md)（#370）
- #368 修好後第一次 `apply=1` 就殺掉真正管理 health-web 的 daemon，造成當天第三次停機；改以活著的 next-server 祖先鏈為保護依據。

#### Watchdog 在 PM2 自動拉起的空窗誤判離線，每次被砍多重啟一次 🟡（#707，待上線驗證）
- 現象（2026-10-17 04:51 UTC，主機 `~/.pm2/pm2.log` 與 `~/health_app/.apply-prebuilt.log`）：`health-web` 被外部 SIGKILL，PM2 當場（約 1 秒內）自動拉起，但 Next 還要約 5–10 秒才開始監聽 3000 埠；看門狗在 04:51:29 啟動 `apply-prebuilt-force`，04:52:35 對這個其實已在正常啟動的行程又送一次 SIGINT 重啟，04:52:50 才恢復。被砍目前平均約每 35 分鐘一次，所以**每次意外被砍，服務中斷從約 10 秒被放大成 1–2 分鐘**。
- 根因：看門狗（`/__ops/pm2-ensure-running`）只用單次 `fsockopen`／HEAD 探測；訪客請求代理失敗後會機會式觸發它（`$triggerPm2Watchdog`，約在被砍後 4 秒），剛好落在「PM2 已拉起、Next 還沒監聽」的空窗，判成「health-web was not online」，直接升級到 apply-prebuilt。
- 修法（`.remote-health-index.php` 單檔，沒有動 `.pm2-recovery-guard.php`，避免兩個檔案分次上傳的版本落差）：在**所有既有護欄之後、升級之前**加入寬限重探測——`$healthGraceSeconds = 25`、每 `2.5` 秒用同一支 `$probeLocalHttp(3000, …)` 再探一次，任何一次成功就視為在線：`.pm2-watchdog.log` 寫 `health-web grace re-probe succeeded after N.Ns (K re-probe(s))`，重新探測 mall，兩者都在線就清除復原狀態並結束，**不升級、不記錄恢復嘗試**；25 秒後仍不通則寫 `grace re-probe failed … escalating`，之後完全照舊走 apply-prebuilt（升級訊息 `health-web was not online … restarting via apply-prebuilt` 不變）。
- 不變的護欄：共用 PM2 恢復鎖（`recovery.lock`，非阻塞取得）、NPROC task gate（寬限期後 `$triggerPrebuiltRun` 在真正 spawn 的當下會再檢查一次）、`Pm2RecoveryGuard` 退避（5 分鐘起、上限 1 小時）、單一執行鎖。寬限放在鎖、gate、「已有 apply-prebuilt 在跑」與退避判斷**之後**，所以任何本來就不能升級的 tick（gate 關閉、退避中）不會多等這 25 秒；只有「本來就要升級」的 tick 會先等，真當機時只是升級晚約 25 秒。只有 mall 掛掉時不經過寬限。
- PHP worker 佔用：阻塞式，但有上界。同一時間只有一個 tick 能進寬限（鎖是非阻塞的，其他 tick 立刻回 202）；cron 與機會式觸發各自每 5 分鐘最多一次；`usleep()` 不 fork，不吃 NPROC。最壞情況約 **32 秒**（25 秒等待＋最後一次探測的 2 秒連線＋5 秒讀取，一般連線被拒是瞬間回），與代理路徑本來就允許單一慢請求佔 worker 30 秒（`CURLOPT_TIMEOUT`）同量級，不擴大 Entry Process（上限 20）的風險面。代價：同一把鎖上 apply-prebuilt 的 `flock -x` PM2 步驟最多多等這麼久。因為這個風險可接受，沒有採用「把首次判定離線的時間戳存進狀態檔、下一輪再升級」的非阻塞做法（它會讓真當機的復原最多再延後一個 5 分鐘 tick）。
- 配合調整：機會式觸發的 fire-and-forget `curl` 的 `--max-time` 從 8 改成 60（cron 版本本來就是 90），並在寬限段落呼叫 `ignore_user_abort(true)`，避免呼叫端中途掛斷、導致「升級或不升級」的決策被打斷。
- 測試：`tests/pm2-watchdog-contract.test.php`（CI 的 `php-lint.yml` 執行）鎖定寬限只出現在鎖／gate／退避之後、升級之前，窗口 20–30 秒、間隔 2–3 秒、以牆鐘 deadline 為界、不 fork、不啟動 PM2，且升級訊息與機會式 curl 逾時沒被改回去。
- 上線後驗證：被砍之後 `~/health_app/.pm2-watchdog.log` 應出現 `grace re-probe succeeded after`，且 `~/health_app/.apply-prebuilt.log` 不再於同一分鐘出現 `[START-FORCE-V4]`／第二次 SIGINT；真當機時應看到 `grace re-probe failed` 後照舊升級。

#### HawkHost 主機最佳化與治理 ✅
- 原檔：[hawkhost-server-optimization.md](../archive/specs/hawkhost-server-optimization.md)
- V8 heap 預設依主機可見的 54GB 配置 → 被 LVE 靜默 SIGKILL；改為固定 768MB 讓記憶體壓力變成可捕捉的錯誤；PM2 log rotate（`pm2-logrotate` 模組；2026-10-18 起改由 app 內每日 job 取代，見 4.2）；Node 版本固定。

### 4.2 記憶體與 502

#### 伺服器端 fetch() WASM OOM 造成 502 ✅
- 原檔：[fix-server-fetch-wasm-oom-502.md](../archive/specs/fix-server-fetch-wasm-oom-502.md)（PR #111）
- IndexNow 提交使用全域 `fetch` 觸發；全面改用原生 `node:https` 客戶端。

#### 禁止伺服器端 fetch 的回歸防護 ✅
- 原檔：[no-server-fetch-regression-guard.md](../archive/specs/no-server-fetch-regression-guard.md)（#114）
- `tests/no-server-fetch.test.mjs` 掃描伺服器端程式碼，出現全域 `fetch(` 即失敗。

#### 全域停用圖片最佳化、PHP 代理分流 ✅
- 原檔：[global-unoptimized-images-and-php-bypass-502.md](../archive/specs/global-unoptimized-images-and-php-bypass-502.md)
- 首頁 30+ 張圖同時打 `/_next/image` 衝破記憶體；改 `images.unoptimized: true`，靜態資源由 LiteSpeed／PHP 直接回應。
- 備註：因此 `sharp` 已無用途（2.0 將移除；若未來重新啟用圖片最佳化需一併恢復）。

#### httpClient 共用 keep-alive TLS Agent 🟡（#699 修正，待上線驗證）
- 原檔：[httpclient-shared-tls-agent.md](../archive/specs/httpclient-shared-tls-agent.md)（#401）
- 見待辦 O-1。

#### RSS 匯入記憶體尖峰（SIGKILL 於匯入啟動後約 3 分鐘）🟡（#699，待上線驗證）
- 現象：Node 回滾到 20.20.2（#700）後 SIGABRT 消失，但每小時仍有 3–6 次 SIGKILL（沒有 V8 FATAL ERROR，RSS 遠低於 `max_memory_restart`，是主機 LVE 的實體記憶體管控），多數落在 RSS 匯入啟動後約 3 分鐘；匯入被殺所以 `ingest_runs` 永遠停在 `running`。
- 無法對正式站量測，所以做了本機可重現的量測治具（`scripts/measure-rss-ingestion-memory.mjs`，真的 `runRssIngestion` 對本機合成世界跑，不碰任何真實網站）。找到的記憶體大戶，依貢獻排序：①整頁 cheerio DOM 只為了取 og:image；②每條 TLS 連線一個 `SecureContext`；③V8 不知道主機的實體上限，死掉的堆積（DOM、XML、HTTP body）不會被及時回收；④列表頁縮圖每輪重抓（已加 6 小時 URL→檔案記憶）。
- 修法與護欄：`lib/server/rss/runMonitor.ts`（單位工作之間：鎖心跳＋堆積預算＋一行階段日誌＋讓出事件迴圈）、`lib/server/sync/heapGovernor.ts`、`lib/server/sync/stageLog.ts`；階段日誌事件名 `rss_ingestion_stage`（每個 feed／來源一行，含 `heapUsedMB`／`rssMB`／`externalMB`），被殺前最後一行就是當時在跑的來源。
- 鎖：`internal-cron` 與 `admin-manual` 都走 `runRssIngestion` 的同一把 MySQL advisory lock（`rss_ingestion_lock`）。先取鎖、才建立 `ingest_runs` 列；取不到鎖的嘗試寫成 `status='skipped'`（不是 `failed`、不丟例外、不寫 `ingest_errors`）。匯入期間每個單位工作間用 `IS_USED_LOCK` 確認鎖還在（連線被資料庫關掉鎖會無聲消失），並順便更新 `ingest_runs.updated_at`；孤兒判定改看「沉默 20 分鐘」而非「開始 20 分鐘」，窗口沒有放寬。
- `GET /api/admin/ingestion-runs` 新增 `limit`／`offset`／`status`／`trigger` 參數。

#### health-web 每 5 分鐘一行資源日誌（`proc_resources`）🟡（#709，待上線驗證）
- 背景：#703 之後 `health-web` 仍約每 15–35 分鐘被外部 SIGKILL（pm2 日誌 `exited with code [0] via signal [SIGKILL]`，沒有 V8 錯誤，被殺的行程也來不及留下任何東西），所以只能靠它**事先**印下的線索。這是 O-5 的第一步，只做觀測，不改變任何行為。
- 實作：`lib/server/logging/procResourceLogger.ts`，由 `instrumentation.ts` 在 Node.js runtime 啟動（啟動時一行，之後每 5 分鐘一行，`console.log` 直接進 pm2 的 out 日誌，風格同 `lib/server/sync/stageLog.ts`）。沒有新增任何路由，對外不暴露任何東西。
- 欄位（一行一個 JSON，`"event":"proc_resources"` 開頭是穩定的 grep 識別字）：`ts`（ISO 時間；pm2 預設不幫 out 日誌加時間戳，所以自己帶）、`pid`（被殺重啟後會換）、`uptimeS`、`rssMB`／`heapUsedMB`／`heapTotalMB`／`externalMB`／`arrayBuffersMB`（`process.memoryUsage()`）、`vmSizeMB`／`vmPeakMB`／`vmRssMB`／`vmDataMB`／`threads`（`/proc/self/status` 的 VmSize／VmPeak／VmRSS／VmData／Threads）、`fdCount`（`/proc/self/fd` 的檔案數，含列舉動作本身開的那一個）、**帳號層級**欄位 `acctRssMB`（同一 uid 所有行程的 `VmRSS` 總和）／`acctProcs`（同 uid 行程數）／`acctThreads`（同 uid 執行緒總數）／`loadAvg1`（`/proc/loadavg` 第一個值），每 5 分鐘走訪 `/proc/<數字>/status` 讀 `Uid`／`VmRSS`／`Threads`（約 10–30 個小檔案，每個行程各自 try/catch，行程中途結束不影響其他）。背景：2026-10-17 10:13–10:14 UTC `health-web` 在 50 秒內被 SIGKILL 7 次，**同帳號的 mall 同時被 SIGKILL 5 次**，所以是帳號層級（CloudLinux LVE，cgroup `/lve2004`）的管控事件，而不是 `health-web` 單獨的問題；這幾個欄位用來跟 LVE 上限對帳。`acctRssMB` 是各行程 RSS 直接相加，共用頁面會重複計算，是 LVE 實際計費值的**上限估計**，看趨勢與跳變，不要當成精確值；非 Linux 一律 `null`。`eventLoopDelayP99Ms`／`eventLoopDelayMaxMs`（`perf_hooks.monitorEventLoopDelay`，每個區間讀完歸零，已扣掉取樣週期 20 ms 的基線；啟動那一行沒有樣本所以是 `null`）、`activeJobs`（當下正在跑的行程內 cron 工作名稱，同 `logs/memory-monitor.log` 用的那份集合）。讀不到的欄位一律是 `null`（非 Linux 開發機沒有 `/proc`）。
- 護欄：每個欄位各自 try/catch，任何讀取失敗只會讓該欄位變 `null`，不會丟例外；interval 有 `unref()`，不會讓行程停不下來；`globalThis` 上用 `Symbol.for("health.procResourceLogger")` 守衛，熱重載或模組被載入兩次也只有一個 timer；只在 `NODE_ENV=production` 執行（本機要試用設 `PROC_RESOURCE_LOG=1`；`PROC_RESOURCE_LOG=0` 可在正式環境關掉而不必改程式）。成本：每 5 分鐘讀一次 `/proc` 小檔案與列一次 fd 目錄，加上一個 libuv 內建取樣 timer，不新增行程或執行緒。
- 被砍之後怎麼看（正式主機，帳號 `tw123457`）：
  1. 在 `~/.pm2/pm2.log` 找到 `exited with code [0] via signal [SIGKILL]` 的時間。
  2. `grep '"event":"proc_resources"' ~/.pm2/logs/health-web-out*.log | tail`（輪替後的舊檔也一起 grep；每行內有 `ts` 可對時間。**要帶引號與逗號前的完整 `"event":"proc_resources"`**：2026-10-18 起還有 `proc_resources_spike` 行，單用 `grep proc_resources` 兩種都會撈到，後者沒有 `rssMB`／heap 等欄位）。被砍行程的最後一行，就是死前 0–5 分鐘內的狀態；它的 `pid` 與 `uptimeS` 可對應到該次行程，`uptimeS` 小的下一行就是重啟後的第一行。
  3. 判讀：`vmPeakMB` 在死前逼近 2048 → 位址空間（`RLIMIT_AS`）而非實體記憶體；`rssMB` 逼近同帳號實體上限而 `vmSizeMB` 平穩 → 實體記憶體；`fdCount`／`threads` 持續上升 → 洩漏或行程數；死前最後一行的 `eventLoopDelayMaxMs` 很大 → 行程已先卡死；`activeJobs` 非空 → 對照是哪個 cron 工作在跑；`acctProcs`／`acctThreads` 逼近 CloudLinux 的 NPROC／Entry Processes 上限或 `acctRssMB` 逼近 LVE 實體記憶體上限 → 帳號層級資源耗盡，多個 app 一起被砍（拿 `lveinfo` 的 LVE 上限與被砍時刻比對）；`loadAvg1` 持續偏高（本機長期 10–12）只代表鄰居搶 CPU，單獨不足以解釋被砍。
- 上線後驗證：①部署重啟後 `health-web-out*.log` 在約 10 秒內出現第一行 `proc_resources`（`vmSizeMB`／`vmPeakMB`／`fdCount`／`threads`／`acctProcs`／`loadAvg1` 是數字、不是 `null`，證明 `/proc` 在 LVE 內可讀；`acctProcs` 應與 `ps -u tw123457` 的行程數同量級，約 5–10，若遠小於代表 CageFS 隱藏了其他行程，這時 `acct*` 只代表可見範圍）；②之後每 5 分鐘一行（`ts` 間隔約 300 秒）；③下一次 SIGKILL 後，死前最後一行落在被殺時間前 5 分鐘內；④確認沒有新增行程（`ps` 計數不變）、`/api/*` 回應不受影響。若 LVE 內 `/proc/self/status` 讀不到，欄位會是 `null`，那時改以 `rssMB`／`externalMB` 趨勢推斷。

#### 尖峰與逐行程組成：`proc_resources` 新欄位與 `proc_resources_spike` 🟡（#709，2026-10-18，待上線驗證）
- 背景：帳號實體記憶體上限只有 1 GB（見 1.3），每小時平均 580–730 MB，被砍是**小時內的短暫尖峰**；5 分鐘一行只有「帳號 RSS 總和」，取樣太稀，也看不出尖峰是誰造成的。所以在 `lib/server/logging/procResourceLogger.ts` 追加：
  - **15 秒快速取樣**（另一個 `unref()` 計時器，同一個啟用開關與 `globalThis` 守衛）：只走 `/proc/<pid>/status` 讀同 uid 行程的 `VmRSS`，記錄自上一行 `proc_resources` 以來的**帳號 RSS 總和高點**。只有創新高、寫 spike 行、或組 5 分鐘行時，才多讀前幾名行程的 `cmdline`／`cwd` 來貼標籤；平常不讀。
  - **`proc_resources` 新欄位（一律接在既有欄位與 `activeJobs` 之後，既有欄位名稱與順序沒動）**：`acctRssPeakMB`／`acctRssPeakAt`（上一行以來帳號 RSS 總和的高點與發生時間，ISO）、`ownRssPeakMB`（同期間本行程 RSS 高點）、`ownHwmMB`（本行程 `VmHWM`，自啟動以來的 RSS 歷史高點）、`peakProcs`（**帳號高點當下**的逐行程明細）、`procs`（本行取樣當下的逐行程明細）。`/proc` 不存在（Windows／macOS）時全部是 `null`／`[]`。
  - **逐行程明細**：每筆 `{pid,label,rssMB,hwmMB}`，依 RSS 由大到小取前 6 筆。`label`：`health-web`（cwd 含 `health_app`）、`mall`（cwd 含 `mall_app`）、`pm2-daemon`（cmdline／comm 含 `PM2`／`God Daemon`）、`pm2-module`（cmdline 含 `.pm2/modules`，即 pm2-logrotate）、`pm2-cli`（`pm2 jlist` 這類指令，例如看門狗開的）、`lsphp`、`deploy`（`tar`／`gzip`／`sh -lc cd …health_app`／`apply-prebuilt`），其餘用 `comm`。命令優先於 cwd 判斷（God Daemon、pm2 模組、部署用 shell 的 cwd 也可能是 `health_app`）。
  - **`proc_resources_spike` 行**：帳號 RSS 總和 ≥ 800 MB（環境變數 `PROC_RESOURCE_SPIKE_MB` 可覆寫）時立刻多印一行 `{"event":"proc_resources_spike","ts","acctRssMB","ownRssMB","procs":[…],"activeJobs":[…],"eventLoopDelayMaxMs"}`，同一行程最多每 60 秒一行。`eventLoopDelayMaxMs` 是「自上一行 `proc_resources` 以來」的最大值，讀取時不重設直方圖（重設屬於 5 分鐘那行）。
  - 行長：5 分鐘行約 1.2 KB（6+6 筆明細時），spike 行約 0.5 KB；超過 2000 字元時先砍明細陣列（`peakProcs`、`procs`），再砍 `activeJobs`，其他欄位不動。
- 怎麼讀：
  1. 在 cPanel 找出有 PMEM fault 的小時（見 1.3），或在 `pm2.log` 找到 SIGKILL 時間。
  2. `grep proc_resources_spike ~/.pm2/logs/health-web-out*.log | tail`：spike 行的 `ts` 與 SIGKILL 時間對照；`procs` 就是當下誰用了多少。再用 `grep '"event":"proc_resources"'` 看同一個 5 分鐘區間的 `acctRssPeakMB`／`acctRssPeakAt`／`peakProcs`（尖峰當下的組成）。
  3. 判讀：`health-web` 一個就超過約 700 MB → 降 `health-web` 本身（堆積、同時進行的 cron job 看 `activeJobs`）；`mall` 佔大宗 → 要和 mall 一起處理（另一個 repo）；`pm2-module`（pm2-logrotate，約 45–55 MB）與 `pm2-daemon` 是固定成本，只能靠移除模組／減少重啟；`deploy`、`pm2-cli`、`lsphp` 出現在尖峰裡 → 是部署、看門狗或 PHP 代理造成的短暫增量；`acctRssPeakMB` 遠高於 `acctRssMB` → 尖峰很短，要靠 15 秒取樣才看得到。
  4. `acctRssMB`／`acctRssPeakMB` 是各行程 `VmRSS` 直接相加，共用頁面重複計算，是 LVE 實際計費值的**上限估計**，看趨勢與哪個行程貢獻最多，不要當精確值（實際 PMEM 可能略低，所以 800 MB 的門檻比 1 GB 上限低一些，留給預警）。
- 成本：每 15 秒讀約 5–30 個小檔案（同一次呼叫內各自 try/catch），不新增依賴、行程或執行緒；diagnostics 本身失敗只會讓該行少欄位，不會影響 web 行程。

#### PM2 日誌保留期：移除 `pm2-logrotate`，改由 app 內每日 job 🟡（#709，2026-10-18，待上線驗證）
- 決定：使用者 2026-10-18 決定**移除 `pm2-logrotate`**——它常駐約 45–55 MB 並佔 10 個 task，而帳號實體記憶體上限只有 1 GB（見 1.3）。**正式主機上的 `pm2 uninstall pm2-logrotate` 不在這個 PR 裡，由維運人員另行操作**（這個 PR 沒有改 `ecosystem.config.cjs`，也沒有改任何 PM2 設定）。
- 移除前的設定（供回滾）：`max_size` **10M**、`retain` **3**、`compress` **true**、每日 **00:00** 輪替。
- 回滾指令：`pm2 install pm2-logrotate && pm2 set pm2-logrotate:max_size 10M && pm2 set pm2-logrotate:retain 3 && pm2 set pm2-logrotate:compress true`。回滾後 app 內 job 可以先留著（它只動符合樣式的檔案，命名與保留期判斷都只看檔名與 mtime，不會和 pm2-logrotate 互相覆蓋），但兩者做同一件事，建議擇一。
- 為什麼不能什麼都不做：`~/.pm2/logs` 約 50 MB／92 個檔，`health-web` 的 out 與 error 各約 3 MB／天，沒有輪替就會無限成長。
- 取代它的 job：`lib/server/logging/pm2LogRetention.ts`，在 `lib/server/cron/registerJobs.ts` 以 `runGuarded("pm2-log-retention-cron.log", …)` 註冊，**每天 01:46**（分鐘 46 是 cron 碰撞 lint 的未使用分鐘，沒有新增 baseline）。沒有常駐行程、不用主機 crontab；規劃（純函式 `planPm2LogRetention`，輸入檔案的 name／size／mtime／是否為本行程的現行日誌）與執行（薄薄一層 fs，一次處理一個檔案，用 `copyFile`，不把日誌讀進記憶體）分兩段，規劃函式有完整單元測試。目錄預設 `~/.pm2/logs`，`PM2_LOG_DIR` 可覆寫。
  - **誰在寫日誌、「現行日誌」怎麼找（2026-10-18 正式主機唯讀實測）**：寫日誌的**不是 `health-web` 本行程，而是 PM2 God Daemon**。fork 模式下 PM2 用 pipe 把 `health-web` 的 stdout／stderr 交給 daemon，由 **daemon** 以 append（`O_APPEND`）方式開檔寫入：`health-web` 自己的 `/proc/self/fd/1`、`fd/2` 是 `socket:[…]`，不是檔案；daemon 的 `/proc/<daemon pid>/fd/*` 才指向 `~/.pm2/logs/health-web-out-1.log`、`health-web-error-1.log`、`mall-out-2.log`、`mall-error-2.log` 與 `~/.pm2/pm2.log`。所以 job **不能**從自己的 fd 解析現行日誌（第一版就是這樣，在正式環境會永遠解析失敗：現行日誌不輪替、遺留檔清理全部跳過）。PM2 有把路徑放進 `health-web` 行程的環境變數：`pm_out_log_path`、`pm_err_log_path`（另有 `pm_id`、`name`）。job 以這兩個變數為**主要來源**，`/proc/self/fd/1`、`fd/2` 只在變數缺少時（不是 PM2 啟動的行程）當後備；不論來源，路徑都必須**直接位於日誌目錄、檔名符合 `health-web-(out|error)` 樣式**才算數（`socket:[…]`、日誌目錄外、含 `..`、`mall-*`、輪替檔、`pm2.log` 一律被拒絕）。PM2 給了路徑但驗證不過時，不會改用 fd 再試一次——驗證不過就是「未解析」，什麼都不猜。每次的摘要行有 `active`（找到的現行日誌檔名）與 `activeResolved`，`active` 為空就是「找不到現行日誌」。
  1. **輪替（copytruncate）**：①現行日誌（上一項；任一個未解析就跳過該個），**嚴格大於 8 MiB**，或距離最新一份輪替檔已超過約 23 小時（用輪替檔的 mtime 判斷，沒有狀態檔；刻意略小於 24 小時，避免每天啟動時間的毫秒級抖動讓它隔天才輪替）且檔案非空，就 `copyFile` 成 `<原名去掉 .log>__YYYY-MM-DD_HH-mm-ss.log`（伺服器本地時間，與 pm2-logrotate 的命名同形）再 `open(O_WRONLY)` ＋ `ftruncate(0)` 清空原檔。寫入者雖然是另一個行程（daemon），截斷仍然安全：daemon 以 `O_APPEND` 持有檔案，下一次寫入會落在新的檔尾（offset 0），不會留下空洞或沿用舊位移（測試用一個持有 `O_APPEND` 控制代碼的「假 daemon」驗證過）；複製與截斷之間寫入的幾行會遺失（copytruncate 的通例）。②`~/.pm2/pm2.log`（God Daemon 自己的日誌，SIGKILL 的唯一紀錄）只看大小（> 8 MiB），**絕不刪除**。
  2. **刪除過期檔**（mtime **嚴格大於 7 天**，剛好 7 天保留）：輪替檔 `health-web-(out|error)[-N]__<日期>.log[.gz]` 與 `pm2__<日期>.log[.gz]`（`.gz` 是 pm2-logrotate 的 `compress` 留下的）；PM2 舊實例遺留、**不是現行日誌**的 `health-web-(out|error)-N.log`（只有在 stdout 與 stderr 兩個現行日誌都解析成功時才刪，否則一個很久沒有寫入的現行 error 日誌會被誤判為遺留）；pm2-logrotate 自己的 `pm2-logrotate-*.log`。
  3. **絕不碰**：`mall-*`、不符合上述樣式的任何檔案、現行日誌（只輪替不刪除）、符號連結與非一般檔案（只處理 `readdir` 結果中名稱**完全符合**樣式的檔案，並再 `lstat` 一次確認不是連結；`unlink` 只移除名稱，不會跟著連結刪到別處）、`~/.pm2` 下除了 `pm2.log`／`pm2__*.log` 之外的所有東西（`dump.pm2`、`pm2.pid`、`modules/`、socket…）。`~/.pm2` 只有在日誌目錄本身叫 `logs` 時才會被查看。
  4. **摘要**：每次執行印出並回傳一行 `{"event":"pm2_log_retention","ts","rotated":[…],"deleted":[…],"skipped":n,"freedMB":x,"errors":[…],"active":[…],"activeResolved":true}`（`console.log` 進 pm2 out 日誌，`runGuarded` 也會寫進 `logs/pm2-log-retention-cron.log`）。任何失敗只記在 `errors`，不拋出。查：`grep pm2_log_retention ~/.pm2/logs/health-web-out*.log | tail`。
- **`mall-*` 日誌**：`pm2-logrotate` 原本也在輪替 `~/.pm2/logs` 下所有檔案（含 `mall-*`），移除後 `mall` 的日誌沒有人輪替；但 2026-10-18 實測 `mall-*` 全部加起來只有約 76 KB（約 10 KB／天），**已確認不需處理**，日後成長再議。這個 job 依規定**不碰** `mall-*`（另一個 repo、不在這裡）。
- 上線後驗證：①部署重啟後（含 `pm2 uninstall pm2-logrotate`）隔天 01:46 之後出現 `pm2_log_retention` 行，`errors` 為空，**`active` 是兩個現行日誌檔名（如 `["health-web-error-1.log","health-web-out-1.log"]`）且 `activeResolved` 為 `true`**（`active` 為空代表找不到現行日誌：先檢查 `health-web` 行程環境有沒有 `pm_out_log_path`／`pm_err_log_path`，讀 `/proc/<pid>/environ` 時不要印出其他變數）；②`ls -la ~/.pm2/logs` 看到 `health-web-out-N__<日期>.log`、原檔已截斷；③`pm2.log` 還在、`mall-*` 沒被動到；④`ps` 看不到 `pm2-logrotate` 行程，`acctRssMB` 少約 45–55 MB。

#### 大型種子 JSON：按需讀取，不再靜態 import 🟡（#709，2026-10-19，待上線驗證）
- 背景：Next 預設開機就載入全部路由模組（`preloadEntriesOnStart`），所以 `import x from "@/data/foo.json"` 會讓整份 JSON 的原始碼文字打包進 server chunk、**開機就常駐**（中文字串每字 2 bytes），解析後的物件還會被模組快取留到行程結束。量測（[memory-attribution-709.md](../specs/memory-attribution-709.md)）：chunk 內的 JSON 種子 33 MB，其中辭典 24 MB（另一個 PR 處理），其餘約 9 MB；而這些種子幾乎都只是「資料庫沒資料／查詢失敗」才用的後備，路由流量極低（18 天 origin：哺乳室 11 次、遺產地圖 17 次、辭典 12 次）。
- 做法：`lib/server/db/transientSeed.ts` 的 `readTransientSeedJson(filename, { ttlMs })`。**請求時才讀檔＋解析；TTL（預設 60 秒，從載入時起算的絕對時間，不因持續有請求而續命）內共用同一份物件；逾時由 `unref()` 的計時器移除參照**，物件即可被 GC 回收（單元測試用 `WeakRef`＋`--expose-gc` 實測）。最壞情況是每個 TTL 週期多解析一次（1.5 MB 約 10 ms，6.6 MB 的 `public-art.json` 約 40 ms）。回傳值一律當唯讀。
- 受影響的檔案（皆 > 100 KB；`aed.json`、`tourism_factory.json` 雖然不到，但與同一個路由的其他種子一併處理）：`breastfeeding-rooms-seed.json`（`/api/breastfeeding-rooms`，無資料庫可退）、`contraception-map-seed.json`（`/api/contraception-map`、`/api/facilities` 的「避孕諮詢」）、`heritage-map-seed.json`（`/api/heritage-map` 後備，原本還有一份同檔的 fs 後備，合併成一次）、`latest-books-seed.json`（`loadOfflineBooksSeed`；`/api/books` 不再先靜態 import 再傳進去）、`pet-adoptions-seed.json`（`/api/pet-adoptions` 後備）、`facilities-seeds/{vet_clinic,cpc_gas_station,bookstore,tourism_factory,aed}.json`（`/api/facilities` 後備、`lib/server/cpc/stations.ts`；中油站點的「服務項目」清單只由種子算一次並永久記住這份小結果）、`cultural-events-seed.json` 與 `public-art.json`（`lib/server/culture/queries.ts` 原本讀進來就存在模組層變數永不釋放，約 7.3 MB 常駐；注意**關鍵字查無結果也會落到種子後備**，所以正式站有資料庫時也會觸發）。
- **路徑（為什麼是 `public/data` 優先）**：deploy-ftps.yml 的 `cp -r data/* public/data/` 把整個 `data/` 放進 `.prebuilt-public.tgz`，`.remote-health-index.php` 每次部署都解壓覆寫 `~/health_app/public/`；而 `~/health_app/data` 只有「不存在時」才會被建成指向 `public/data` 的符號連結，已是實體資料夾時只做 `cp -rn`（**不覆寫既有檔**，可能是舊版）。PM2 的 `cwd` 是 `/home/tw123457/health_app`（`ecosystem.config.cjs`），所以讀取器依序找 `process.cwd()/public/data/<檔>`、`process.cwd()/data/<檔>`，才會和「種子被打包進建置輸出」時拿到的內容一致。**這和 `readSeedJson()`（先 `data/` 再 `public/data/`）順序相反，後者沒有動。**部署流程模擬（同樣的 tar／解壓／符號連結步驟，含一個故意放舊檔的實體 `data/`）確認 12 個檔案都從 `public/data/` 讀到與 repo 相同的內容。`next build`（CI，沒有資料庫）時 `public/data` 還沒有種子檔（`cp -r data/* public/data/` 在建置之後才執行），會退到 `data/`；預先產生的頁面文字與改動前相同（比對 191 頁，只有水情頁因建置時間戳不同，與本改動無關）。
- **找不到檔／檔案壞掉時（部署缺檔）**：讀取器回傳 `null`，並寫一行 `[seed] 找不到種子檔 <檔名>（已嘗試：…），該功能降級為無資料。`（或 `無法讀取或解析種子檔`），同一檔每分鐘最多一行；失敗不留快取項目，下一次請求會重試。降級行為：沒有其他資料來源的 `/api/breastfeeding-rooms`、`/api/contraception-map` 回 **503＋`Cache-Control: no-store`**（避免 CDN 把空清單當正常結果存起來）；其餘路由維持原本「沒資料」的回應形狀（遺產地圖 `{ok:true,points:[],updatedAt:null}`、書籍 `books:[]`、中油站點空清單、藝文空結果、設施 502、寵物領養 500），不丟例外。查：`grep '\[seed\]' ~/.pm2/logs/health-web-out*.log | tail`。
- 實測（本機 Node 20.20.2、無資料庫、`next start`，用 `scripts/ops/memory-attribution/` 的治具；數字是 MB）：新舊兩個建置同時啟動、爬站序列相同，強制 GC 後 `heapUsed` 5 分鐘 143.7 → 124.6（−19.1）、30 分鐘 244.5 → 218.9（−25.6）（Windows 的 RSS 是 working set、雜訊大，只看方向）；逐路由探針：開機後強制 GC 的 `heapUsed` 83.9 → 75.2（−8.7）、RSS 132.1 → 122.1（−10.0）；把上面所有路由各打一遍後（強制 GC，辭典除外）：改動前 +28.0 且閒置 75 秒後仍 +27.1（永不釋放），改動後 +20.1（TTL 內）、閒置 75 秒後 +5.6（RSS +12.3）。server chunk 內大於 20 KB 的 JSON 字面量合計 19.98M 字元 → 15.62M 字元，剩下的約 15M 字元是辭典與 cedict。
- **刻意沒動**：①辭典（`lib/server/dictionary/**`，另一個 PR）。②`lib/server/news/data/cedict-terms.json`（1.8 MB）：它**不是熱路徑**——只有每 10 分鐘的 `news-card-images` 排程與管理 API 會呼叫，而且只在標題沒有命中 `KEYWORD_TERMS` 時才查；它已經是 `import()` 惰性載入（開機不載入）。載入一次約 45 ms、常駐約 7 MB 堆積＋2.8 MB chunk 文字；改成按需讀檔要把檔案從 `lib/`（不會被部署）搬到 `data/`，而尖峰（排程剛好在 :00／:10／… 與其他排程同時跑）並不會因此降低，只降平均，所以建議維持「惰性載入＋常駐」。③低於 100 KB 的 JSON（語系檔 `locales/*.json` 16–65 KB 是每頁都用的、`cpc-prices-seed.json` 71 KB 等）。
- 防回歸：`tests/json-seed-on-demand-709.test.mjs` 掃描 `app/`、`lib/`、`components/`，**任何靜態 import／`import()` 超過 100 KB 的 JSON 都會讓測試失敗**（例外清單只有辭典與 cedict，各有理由）。新增大型種子請用 `readTransientSeedJson`，檔名寫死，不要把使用者輸入帶進去。
- 上線後驗證：①部署重啟後打 `/api/breastfeeding-rooms`、`/api/heritage-map`、`/api/facilities?type=aed`、`/api/cpc-stations`，回應與先前相同（可用 `scripts/ops/memory-attribution/seed-route-golden.mjs` 在舊樹與新樹各跑一次後 `diff`，57 個案例逐位元組相同）；②`grep '\[seed\]' ~/.pm2/logs/health-web-out*.log` 沒有任何行（有就代表該檔不在 `public/data/` 或 `data/`）；③`proc_resources` 的 `heapUsedMB`／`rssMB` 對照部署前後。

### 4.3 CDN

#### Cloudflare Free 方案優化手冊 ✅
- 原檔：[CLOUDFLARE_OPTIMIZATION.md](../archive/CLOUDFLARE_OPTIMIZATION.md)
- DNS Proxied＋DNSSEC、SSL Full (Strict)、TLS 1.2+、Origin CA；Smart Tiered Cache；Cache Rules（`/_next/static`、`/images` 一年 immutable；HTML `s-maxage=60, stale-while-revalidate=600`）；Bot Fight Mode 與 AI 爬蟲防護已於 2026-08-16 開啟。
