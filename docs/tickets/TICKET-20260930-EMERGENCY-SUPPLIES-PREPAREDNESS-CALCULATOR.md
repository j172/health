# TICKET-20260930: 全民防災物資：緊急避難包與居家儲備計算機實作

- **Spec Reference**: [docs/specs/SPEC-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md](file:///d:/GoogleDrive/health/docs/specs/SPEC-20260930-EMERGENCY-SUPPLIES-PREPAREDNESS-CALCULATOR.md)
- **Status**: Completed / Merged & Deployed
- **Created**: 2026-09-30
- **Completed**: 2026-09-30

## Tasks

- [x] 1. 於 `lib/server/tools/catalog.ts` 登錄 `emergency-supplies`，包含完整的 AEO、科學基礎、物資參考表、FAQ，並加入 `INDEXABLE_SLUGS`
- [x] 2. 建立客戶端互動元件 `components/Tools/EmergencySuppliesContent.tsx`
  - [x] 雙模式 Tab 切換（個人緊急避難包 Go-Bag vs 家庭居家儲備計算機）
  - [x] LocalStorage 持久化保存打勾狀態與自訂項目
  - [x] 支援 3 天 / 7 天 / 14 天儲備天數與成人/孩童/長者/嬰幼兒/毛孩多維度計算
  - [x] 提供「一鍵複製文字清單」與「列印專用清單檢視」
  - [x] 國防部官方手冊 PDF、指引網站與雙防災 App 捷徑
- [x] 3. 建立工具單頁 `app/tools/emergency-supplies/page.tsx`
- [x] 4. 於 `components/Tools/EmergencyHotlinesContent.tsx`（即 `/emergency` 頂部）加入緊急物資工具導引橫幅
- [x] 5. 撰寫單元與整合測試 `tests/emergency-supplies.test.mjs`
- [x] 6. 執行 `npm run typecheck` 與 `npm run test` 確保零錯誤通過
