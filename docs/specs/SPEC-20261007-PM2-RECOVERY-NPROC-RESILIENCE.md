# SPEC-20261007: 阻斷 PM2 恢復機制引發 NPROC 資源耗盡 (Prevent PM2 Recovery from Amplifying NPROC Exhaustion)

- **Issue/Ticket**: #426
- **Status**: Implemented & Verified in Production (2026-10-07)
- **Author**: Antigravity Assistant & Engineering Team
- **Date**: 2026-10-07
- **Affects**: `.remote-health-index.php`, `.pm2-recovery-guard.php`, `.github/workflows/deploy-ftps.yml`, `.github/workflows/php-lint.yml`
- **Related Specs**:
  - [pm2-daemon-proliferation.md](file:///d:/GoogleDrive/health/docs/specs/pm2-daemon-proliferation.md)
  - [recovery-mechanism-as-load.md](file:///d:/GoogleDrive/health/docs/specs/recovery-mechanism-as-load.md)
  - `SPEC-HEALTH-20260831-PM2-PROLIFERATION`
  - `SPEC-HEALTH-20260831-RECOVERY-LOAD`
  - Issues: #97, #98, #426

---

## 1. 問題背景與故障機制 (Problem Statement & Root Cause)

在 2026-08-31 事故（約 4 小時 39 分鐘 outage）及後續 2026-10-07 的驗證與監控中，主機反覆出現 HTTP 502 錯誤，追查發現關鍵在於 PM2 與 Node.js 在系統行程上限邊緣觸發執行緒/行程建立失敗（`EAGAIN: pthread_create` / `uv_thread_create`）。

主機環境規格：
- **CloudLinux NPROC 限額為 100**（每個 cPanel 帳號所有行程與執行緒總和）。
- 既有的看門狗機制（Watchdog）原意是維持服務可用性，但在遇到系統異常時，本身的自動重啟機制卻反而成為壓垮伺服器的負載：
  1. **行程首腦計數（Process Leaders）嚴重低估實際資源消耗**：過去的門檻檢查僅透過單純的行程數量判斷（如舊版上限 70 或 35），但 2026-10-07 事故現場發現，即使僅有 31 個 Process Leaders，多執行緒 Node/PM2 的 Task 總數早已超過 80~90，直接觸發系統 `EAGAIN` 阻斷。
  2. **看門狗併發踩踏（Watchdog Recovery Stampede）**：每 5 分鐘執行的 `pm2-ensure-running` 在失敗時會嘗試啟動多個 subprocess，若未完成又遇上排程或請求觸發，導致多個重啟程序互相重疊。
  3. **訪客請求自癒機制無冷卻（Unbounded Per-Request Self-Heal）**：當訪客遇到 502 時，前端控制器的 self-heal 路徑若無鎖定與節流，每一次請求都會觸發額外的 watchdog curl，引發連鎖雪崩。
  4. **運維端點（/__ops/*）未防快取且仰賴 fork**：`/__ops/pm2-status` 與 `/__ops/pm2-logs` 若呼叫 PM2 CLI 或 `shell_exec('tail ...')`，在系統資源瀕臨極限時將直接失敗；且若未設定 `Cache-Control: private, no-store, max-age=0`，CDN/邊緣節點會快取舊的故障或維護頁面，干擾判斷。

---

## 2. 解決方案架構 (Architecture & Solution Design)

本次修復將自我恢復保護邏輯獨立封裝至模組 [`.pm2-recovery-guard.php`](file:///d:/GoogleDrive/health/.pm2-recovery-guard.php)，並由 [`.remote-health-index.php`](file:///d:/GoogleDrive/health/.remote-health-index.php) 前端控制器與看門狗端點整合：

### 2.1 零 Fork 式 Task 總數統計與 Task Gate (Forkless Task Counter & Gate)
- **統計方式**：不調用 `ps`、`wc` 或任何子行程，直接讀取 `/proc/<pid>/status` 中的 `Threads:` 欄位累加帳號下所有行程的執行緒總數。
- **門檻設定 (Task Ceiling)**：
  $$\text{Task Ceiling} = 65$$
  計算依據：NPROC 總上限為 100，扣除 35 個保留任務（供 PM2 CLI/Daemon、Node App 替換、以及暫態恢復工作所需之安全裕度）。基準正常值約為 52~53 tasks。
- **Fail Closed 原則**：若無法精確取得任一處理程序之 Task 數，立即判定為 Gate Closed，拒絕繼續派生（spawn）新行程。

### 2.2 序列化 PM2 恢復與指數退避 (Serialized Recovery & Exponential Backoff)
- **全域檔案鎖**：使用 `flock` 於 `.pm2-recovery.lock`，確保看門狗與 Shell PM2 運作序列化，防止重疊執行。
- **獨立重啟服務**：看門狗可獨立重啟 `health-web` 與 `mall`（`ecosystem.config.cjs --only <app>`）。
- **重試退避時間表**：
  $$\text{Delay} = \min(3600, 300 \times 2^{\min(\text{Failures}-1, 4)}) \text{ 秒}$$
  即失敗次數對應 5分、10分、20分、40分、60分（上限 1 小時）的退避冷卻，避免持續對系統施加壓力。

### 2.3 訪客請求 Self-Heal 非阻塞鎖與 5 分鐘冷卻 (Self-Heal Throttling)
- 透過 `.pm2-self-heal.lock` 採用非阻塞排他鎖（`LOCK_EX | LOCK_NB`）。
- 實施嚴格的 5 分鐘（300 秒）冷卻限制，防止訪客請求雪崩式重啟。

### 2.4 零 Fork 式維運端點與快取禁用 (Forkless Ops Diagnostics & Cache-Busting)
- `/__ops/pm2-status`：完全不調用 PM2 CLI，直接自 `/proc` 讀取狀態，呈現 Task 數、Process Leaders 數、Gate 狀態。
- `/__ops/pm2-logs`：以純 PHP 二進位檔案反向讀取（純記憶體 buffer，每次 8KB），零 subprocess 讀取尾端日誌。
- 所有 `/__ops/*` 回應均附帶 `Cache-Control: private, no-store, max-age=0`，強制 Cloudflare / LiteSpeed CDN 繞過快取。

---

## 3. 部署與 CI 整合 (Deployment & CI Pipeline)

1. **FTP 部署工作流更新 ([`.github/workflows/deploy-ftps.yml`](file:///d:/GoogleDrive/health/.github/workflows/deploy-ftps.yml))**：
   - 確保 `.pm2-recovery-guard.php` 與 `.remote-health-index.php` 同步上傳至主目錄與 `health.j172.tw` 網站根目錄。
2. **PHP 語法與合約測試 ([`.github/workflows/php-lint.yml`](file:///d:/GoogleDrive/health/.github/workflows/php-lint.yml))**：
   - 加入 `tests/pm2-recovery-guard.test.php` 與 `tests/pm2-watchdog-contract.test.php`。

---

## 4. 驗證結果 (Verification & Quality Assurance)

- **自動化測試**：
  - `php tests/pm2-recovery-guard.test.php`：PASS（覆蓋排他鎖、退避公式、Task 統計與邊界讀取）。
  - `tests/pm2-watchdog-contract.test.php`：PASS（前端控制器整合契約測試通過）。
  - `php -l`：無語法錯誤。
  - `npm test`：419/419 全部通過。
  - `npm run typecheck`：零錯誤。
- **線上環境驗證**：
  - 正式站直接來源 HTTP 200。
  - `/__ops/pm2-status` 回傳正常，Gate 狀態為 `blocking=no`。
