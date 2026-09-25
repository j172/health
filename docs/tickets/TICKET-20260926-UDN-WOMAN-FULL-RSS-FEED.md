# TICKET-20260926: 擴充 udn 女子漾全站 RSS Feed 收錄範圍

- **Ticket ID**: `TICKET-20260926-UDN-WOMAN-FULL-RSS-FEED`
- **Issue**: #421
- **Related Spec**: [SPEC-20260926-UDN-WOMAN-FULL-RSS-FEED.md](file:///d:/GoogleDrive/health/docs/specs/SPEC-20260926-UDN-WOMAN-FULL-RSS-FEED.md)
- **Status**: Completed / Ready to Merge
- **Type**: Feature / Configuration
- **Date**: 2026-09-26

---

## 1. 任務概要 (Summary)

將「udn 女子漾」新聞來源之 RSS Feed 網址由特定子分類 `https://woman.udn.com/woman/rssfeed/123166`（情慾愛情）更換為全站總 Feed `https://woman.udn.com/woman/rssfeed`，擴大平臺對於健康飲食、運動肌勵、美妝時尚及多元生活話題之收錄範圍。

---

## 2. 驗收標準 (Acceptance Criteria)

- [x] 1. `lib/server/config/rss-feeds.ts` 中 `udn_woman` 的 URL 替換為 `https://woman.udn.com/woman/rssfeed`。
- [x] 2. 測試 fixture 與單元測試 `lib/server/rss/fetchPhase15Sources.test.mjs` 同步並驗證通過。
- [x] 3. 既有歷史資料庫文章不受影響，去重邏輯維持正常。
- [x] 4. 完成 SPEC 與 TICKET 文件建立。
- [x] 5. 執行驗證（`npm run typecheck` 與相關測試全數通過）。
- [x] 6. 依 Worktree 流程提交、合併至 `main` 並觸發正式環境部署。

---

## 3. 執行檢核清單 (Checklist)

- [x] 規格確認與使用者決策盤點（Grill Me 流程完成）
- [x] 程式碼修改（`rss-feeds.ts`）
- [x] 測試修改與執行（`fetchPhase15Sources.test.mjs`）
- [x] 建立 SPEC 文件（`docs/specs/SPEC-20260926-UDN-WOMAN-FULL-RSS-FEED.md`）
- [x] 建立 TICKET 文件（`docs/tickets/TICKET-20260926-UDN-WOMAN-FULL-RSS-FEED.md`）
- [ ] 建立功能分支並提交變更
- [ ] 合併至 `main` 分支並推送
- [ ] 觸發 GitHub Actions 部署工作流程 (`deploy-ftps.yml`)
