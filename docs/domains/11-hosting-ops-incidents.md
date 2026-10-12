# 11 主機、維運與事故

> 合併自 14 份原始文件 · 狀態核對基準：`main` @ `7fe098b`（2026-10-12）
> 狀態圖例：✅ 已上線｜🟡 部分完成｜❌ 未實作｜🗄️ 已取代｜📚 研究

---

## 1. 目前真相：主機硬限制

| 項目 | 值 |
|---|---|
| 主機 | HawkHost 共享主機（新加坡），CloudLinux 8＋LiteSpeed＋MariaDB 10.11＋cPanel；與 `bid.j172.tw` 共用同一帳號 |
| 行程 | PM2 v7（`health-web`），Node **v20.20.2**（nvm），`--max-old-space-size=768`、`max_memory_restart: 1024M` |
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
| O-1 | **httpClient 每次 HTTPS 請求都重建 TLS SecureContext**（#401 OPEN） | 同日 3 次 `std::bad_alloc` 崩潰都在 OpenSSL `AddCACert`；斷路器降低了頻率但機制仍在。修法：共用 keep-alive `https.Agent`（目前 `httpClient.ts` 無 Agent） |
| O-2 | Issue #391（雙 God Daemon）、#394（`_next/image` OOM）仍為 OPEN | 修正已上線，issue 待驗證後關閉 |
| O-3 | Node 20 已 EOL | 已列入 2.0（升級 Node 24，先做記憶體實測） |
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

#### httpClient 共用 keep-alive TLS Agent ❌
- 原檔：[httpclient-shared-tls-agent.md](../archive/specs/httpclient-shared-tls-agent.md)（#401）
- 見待辦 O-1。

### 4.3 CDN

#### Cloudflare Free 方案優化手冊 ✅
- 原檔：[CLOUDFLARE_OPTIMIZATION.md](../archive/CLOUDFLARE_OPTIMIZATION.md)
- DNS Proxied＋DNSSEC、SSL Full (Strict)、TLS 1.2+、Origin CA；Smart Tiered Cache；Cache Rules（`/_next/static`、`/images` 一年 immutable；HTML `s-maxage=60, stale-while-revalidate=600`）；Bot Fight Mode 與 AI 爬蟲防護已於 2026-08-16 開啟。
