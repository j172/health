# TICKET-20261007-MOHW-VIO-MEDICAL-SAFETY: 衛福部醫事人員性平專區（狼醫平台）實作工單

- **關聯 Issue**: [#432](https://github.com/j172/health/issues/432)
- **關聯 SPEC**: [`docs/specs/SPEC-20261007-MOHW-VIO-MEDICAL-SAFETY.md`](file:///d:/GoogleDrive/health/docs/specs/SPEC-20261007-MOHW-VIO-MEDICAL-SAFETY.md)
- **分支名稱**: `feat/issue-432-mohw-vio-medical-safety`

---

## 任務清單 (Tasks)

- [ ] **Task 1: 資料爬取與種子資料建置**
  - [ ] 撰寫 `scripts/sync-medical-violators.mjs`，支援自動獲取 session token/captcha，遍歷 18 大醫事類別。
  - [ ] 執行爬蟲，產出標準化 `data/medical-violators-seed.json`。
  - [ ] 建立 `.github/workflows/medical-violators-sync.yml` 排程與手動工作流程。

- [ ] **Task 2: 註冊公民倡議與友站 (`mohw-vio`)**
  - [ ] 擴充 `lib/constants/contextualPartners.ts`（加入 `mohw-vio`，設定玫瑰紅 Rose 配色與就醫安全標籤）。
  - [ ] 更新 `components/Common/CivicPartnersSection.tsx`（於 `sports-coach` 後置入大卡片）。
  - [ ] 更新 `components/News/SiteFooter.tsx`（頁尾加入 `mohw-vio` 外連）。
  - [ ] 補齊 `locales/{zh-TW,en,ja,ko}.json` 中的 `footer.mohwVio` 翻譯字串。

- [ ] **Task 3: 登錄與建立站內獨立工具頁 (`/tools/medical-violators`)**
  - [ ] 於 `lib/server/tools/catalog.ts` 登錄 `medical-violators`（分類 `care-facility`、加入 `INDEXABLE_SLUGS`、FAQ 與科學根據）。
  - [ ] 實作 `app/tools/medical-violators/page.tsx` 及工作台用戶端元件。
  - [ ] 實作即時搜尋、分類標籤切換、縣市過濾、處分外連、免責聲明與常見問答。

- [ ] **Task 4: 情境式工具聯動 (`/tools/clinics`)**
  - [ ] 於 `app/tools/clinics/page.tsx` 引入情境卡片，提供站內 `/tools/medical-violators` 與官方專區外連。

- [ ] **Task 5: 測試與品質驗證**
  - [ ] 更新 `lib/constants/contextualPartners.test.mjs`。
  - [ ] 撰寫 `tests/mohw-vio-medical-safety.test.mjs`。
  - [ ] 執行 `npm run typecheck`。
  - [ ] 執行 `npm test`。

- [ ] **Task 6: 發布、合併與部署**
  - [ ] 提交 Commit 並推播至 GitHub。
  - [ ] 建立 Pull Request。
  - [ ] 合併 PR 至 `main`。
  - [ ] 觸發 `deploy-ftps.yml` 正式環境部署並完成線上驗證。
