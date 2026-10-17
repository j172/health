# 11 主機、維運與事故

> 合併自 14 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相：主機硬限制

| 項目 | 值 |
|---|---|
| 主機 | HawkHost 共享主機（新加坡），CloudLinux 8＋LiteSpeed＋MariaDB 10.11＋cPanel；與 `bid.j172.tw` 共用同一帳號 |
| 行程 | PM2 v7（`health-web`），Node **v20.20.2**（nvm；**2026-10-16 從 Node 24 回滾**,見 #481：本帳號對行程的位址空間上限（RLIMIT_AS）是 **2 GiB**,Node 24.19 閒置虛擬記憶體 1.29 GB、Node 20.20.2 只有 0.74 GB,Node 24 實際生效（#634 之後,2026-10-15）起 `health-web` 每小時被 SIGABRT 中止 10–25 次（「Committing semi space failed」,堆積才約 300 MB）。要再升 Node 24 前必須先在主機量測閒置 `ps -o vsz` 與執行中行程的 `VmPeak`）,`--max-old-space-size=768`、`max_memory_restart: 1024M`；`ecosystem.config.cjs` 釘住的 interpreter 就是每次部署會套用的版本 |
| CloudLinux 限制 | **NPROC 100**、**Entry Processes 20**（兩者不同；耗盡的通常是 NPROC） |
| 前端 CDN | Cloudflare Free（Full Strict、Smart Tiered Cache、Bot Fight Mode） |
| 部署 | GitHub Actions 建置 → FTPS 上傳 prebuilt；`next.config.js` 也必須上傳（`next start` 從工作目錄讀取） |
| 自我修復 | `.remote-health-index.php`：每 5 分鐘 `pm2-ensure-running`（以 `fsockopen` 探測 port 3000，不 fork），失敗才升級；`/__ops/*` 維運端點 |

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

#### HawkHost 主機最佳化與治理 ✅
- 原檔：[hawkhost-server-optimization.md](../archive/specs/hawkhost-server-optimization.md)
- V8 heap 預設依主機可見的 54GB 配置 → 被 LVE 靜默 SIGKILL；改為固定 768MB 讓記憶體壓力變成可捕捉的錯誤；PM2 log rotate；Node 版本固定。

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

### 4.3 CDN

#### Cloudflare Free 方案優化手冊 ✅
- 原檔：[CLOUDFLARE_OPTIMIZATION.md](../archive/CLOUDFLARE_OPTIMIZATION.md)
- DNS Proxied＋DNSSEC、SSL Full (Strict)、TLS 1.2+、Origin CA；Smart Tiered Cache；Cache Rules（`/_next/static`、`/images` 一年 immutable；HTML `s-maxage=60, stale-while-revalidate=600`）；Bot Fight Mode 與 AI 爬蟲防護已於 2026-08-16 開啟。
