# TICKET-20261007: 整合運動部不適任教練專區至公民倡議友站與短期補習班雙軌查核

- **Ticket ID**: `TICKET-20261007-SPORTS-COACH-CIVIC-PARTNER`
- **Issue**: #430
- **Related Specs**:
  - [SPEC-20261007-SPORTS-COACH-CIVIC-PARTNER.md](../specs/SPEC-20261007-SPORTS-COACH-CIVIC-PARTNER.md)
  - [contextual-civic-partners-in-tool-linking.md](../specs/contextual-civic-partners-in-tool-linking.md)
- **Status**: In Progress
- **Type**: Feature / Civic Alliance
- **Date**: 2026-10-07

---

## 1. 任務概要 (Summary)

收錄運動部（體育署）官方之「涉及違法事件不適任教練資訊專區」（`https://www.sports.gov.tw/News/6295`），比照「台灣罪犯圖鑑（`metawilo.com`）」全套深度模式，納入全站頁尾、首頁/工具目錄「公民倡議與社會守護」大卡片，並在「短期補習班」頁面以緊湊雙卡片堆疊形式與 metawilo 形成官方行政處分與民間司法裁判之雙軌防護查核網。

---

## 2. 驗收標準 (Acceptance Criteria)

- [x] 1. `lib/constants/contextualPartners.ts` 擴充 `CivicPartnerId` 支援 `"sports-coach"`，並配置主題色彩與文字。
- [x] 2. `components/Common/CivicPartnersSection.tsx` 新增 `sports-coach` 卡片項目（排列於 `metawilo` 之後）。
- [x] 3. `components/News/SiteFooter.tsx` 新增運動部不適任教練頁尾外連。
- [x] 4. `app/tools/cram-schools/page.tsx` 導入 Compact 緊湊排版之 metawilo + sports-coach 雙卡片。
- [x] 5. `locales/{zh-TW,en,ja,ko}.json` 補齊 `footer.sportsCoach` 本地化字典。
- [x] 6. 更新 `lib/constants/contextualPartners.test.mjs` 與 `lib/server/tools/footerLinks.test.mjs`。
- [x] 7. 執行 `npm run typecheck` 與 `npm test` 確保全數通過。
- [x] 8. 建立 PR、合併至 `main` 分支並觸發正式環境部署（closes #430）。

---

## 3. 執行檢核清單 (Checklist)

- [x] 1. 執行 GRILL ME 決策審定與收斂
- [x] 2. 建立 GitHub Issue #430
- [x] 3. 撰寫 SPEC 與 TICKET 文件
- [x] 4. 修改程式碼與設定檔
- [x] 5. 更新單元與合約測試
- [x] 6. 本地測試與型別檢查驗證
- [x] 7. Git 提交與分支推送
- [x] 8. 合併至 `main` 並觸發 GHA 部署
