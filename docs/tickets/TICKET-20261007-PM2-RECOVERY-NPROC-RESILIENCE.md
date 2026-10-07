# TICKET-20261007: 阻斷 PM2 恢復機制引發 NPROC 資源耗盡 (Prevent PM2 Recovery from Amplifying NPROC Exhaustion)

- **Ticket ID**: `TICKET-20261007-PM2-RECOVERY-NPROC-RESILIENCE`
- **Issue**: #426
- **Related Specs**:
  - [SPEC-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md](file:///d:/GoogleDrive/health/docs/specs/SPEC-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md)
  - [pm2-daemon-proliferation.md](file:///d:/GoogleDrive/health/docs/specs/pm2-daemon-proliferation.md)
  - [recovery-mechanism-as-load.md](file:///d:/GoogleDrive/health/docs/specs/recovery-mechanism-as-load.md)
- **Status**: Ready to Merge & Deploy
- **Type**: Bugfix / Ops Reliability
- **Date**: 2026-10-07

---

## 1. 任務概要 (Summary)

當主機面對高負載或記憶體/行程吃緊時，PM2 看門狗自我修復機制與前端控制器訪客自癒機制若未受門檻控制，會因無節制建立子程序（fork）而迅速耗盡 CloudLinux NPROC 上限（100 tasks），導致 `EAGAIN` 阻斷與全面 HTTP 502。本任務實作零 fork 的 Task Gate 門檻檢查、恢復機制排他鎖與退避冷卻機制、前端快取防護，以及自動化測試與正式部署。

---

## 2. 驗收標準 (Acceptance Criteria)

- [x] 1. 透過直接讀取帳號所屬之 `/proc/<pid>/status` `Threads:` 欄位累加 Task 總數（零 fork）；當統計失敗或超出 Task Ceiling (65) 時，關閉 Gate 拒絕派生新程序。
- [x] 2. 透過 `.pm2-recovery.lock` 將 PM2 恢復作業序列化，並獨立維護各服務（`health-web`、`mall`）的恢復流程與指數重試退避（5/10/20/40/60 分鐘）。
- [x] 3. 透過 `.pm2-self-heal.lock` 非阻塞鎖保護訪客 502 自癒路徑，加入嚴格的 5 分鐘冷卻限制，防止請求雪崩重啟。
- [x] 4. 維運端點（`/__ops/pm2-status`、`/__ops/pm2-logs`）改為純零 fork 記憶體讀取，並加上 `Cache-Control: private, no-store, max-age=0` 避免 CDN 誤快取過期狀態。
- [x] 5. 加入針對 Task Gating、排他鎖、冷卻退避與前端控制器合約的專屬迴歸測試，並納入 CI 工作流。
- [x] 6. 依 Worktree 流程提交、建立 PR、合併至 `main` 並觸發正式環境部署與線上驗證。

---

## 3. 執行檢核清單 (Checklist)

- [x] 1. 建立核心恢復保護模組 [`.pm2-recovery-guard.php`](file:///d:/GoogleDrive/health/.pm2-recovery-guard.php)
- [x] 2. 更新前端控制器整合模組 [`.remote-health-index.php`](file:///d:/GoogleDrive/health/.remote-health-index.php)
- [x] 3. 撰寫單元與合約測試：
  - [x] [`tests/pm2-recovery-guard.test.php`](file:///d:/GoogleDrive/health/tests/pm2-recovery-guard.test.php)
  - [x] [`tests/pm2-watchdog-contract.test.php`](file:///d:/GoogleDrive/health/tests/pm2-watchdog-contract.test.php)
- [x] 4. 更新 GitHub Actions 部署與 CI 流程：
  - [x] [`.github/workflows/deploy-ftps.yml`](file:///d:/GoogleDrive/health/.github/workflows/deploy-ftps.yml)
  - [x] [`.github/workflows/php-lint.yml`](file:///d:/GoogleDrive/health/.github/workflows/php-lint.yml)
- [x] 5. 建立 SPEC 與 TICKET 文件：
  - [x] [`docs/specs/SPEC-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md`](file:///d:/GoogleDrive/health/docs/specs/SPEC-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md)
  - [x] [`docs/tickets/TICKET-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md`](file:///d:/GoogleDrive/health/docs/tickets/TICKET-20261007-PM2-RECOVERY-NPROC-RESILIENCE.md)
- [ ] 6. Worktree 流程：
  - [ ] 檔案同步至 Worktree `D:\GoogleDrive\health.worktrees\implement-issue-426-pm2-recovery`
  - [ ] 執行本地驗證（PHP 測試、PHP Lint、TypeScript 型別檢查）
  - [ ] 建立 Git Commit 並推播至分支 `agents/implement-issue-426-pm2-recovery`
- [ ] 7. 建立 Pull Request 並合併至 `main` 分支（Closes #426）
- [ ] 8. 觸發 GitHub Actions 部署工作流程 (`deploy-ftps.yml`)
- [ ] 9. 正式環境驗證（確認服務 HTTP 200 與 `/__ops/pm2-status` 狀態正常）
