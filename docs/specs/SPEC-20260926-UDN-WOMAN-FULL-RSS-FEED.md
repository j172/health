# SPEC-20260926: 擴充 udn 女子漾全站 RSS Feed 收錄範圍 (UDN Woman Full RSS Feed Integration)

- **Issue/Ticket**: #421
- **Status**: Accepted / Completed
- **Author**: Antigravity Assistant & Engineering Team
- **Date**: 2026-09-26

---

## 1. 核心動機與背景 (Motivation & Background)

在先前 Phase 15 擴充來源時，專案收錄了聯合新聞網旗下「udn 女子漾」（`udn_woman`），當時主要聚焦於兩性親密與性健康主題，因此鎖定在子分類 Feed：
`https://woman.udn.com/woman/rssfeed/123166`（情慾愛情分類）。

隨著平臺對於多元身心健康、生活衛教、規律運動、飲食營養與女性優質生活關聯內容的需求擴展，單一子分類已無法反映女子漾平臺的全貌（包含「有肌勵」之體能訓練與健康食譜、「愛漂亮」之皮拉提斯與體態雕塑等健康休閒資訊）。

本次變更將 Feed 來源升級至女子漾官方全站總 Feed：
`https://woman.udn.com/woman/rssfeed`

---

## 2. 決策與架構規範 (Decision & Architectural Directives)

經過與產品架構討論（Grill Me 決策盤點），達成以下共識：

1. **來源 URL 替換**：
   - 將 `lib/server/config/rss-feeds.ts` 中 `udn_woman` 的 `url` 由 `https://woman.udn.com/woman/rssfeed/123166` 更新為全站 `https://woman.udn.com/woman/rssfeed`。
2. **收錄與過濾策略**：
   - 採全量收錄（不進行客戶端或排程層自訂關鍵字過濾），維持標準 RSS 抓取的一致性與簡單性。
   - 所有文章保留原生分類標籤（如 `生活娛樂`、`愛漂亮`、`有肌勵`、`情慾愛情`），由既有 AI SEO 管線自動提取關鍵字與摘要。
3. **來源標籤與分類一致性**：
   - 維持來源識別碼 `code: "udn_woman"` 與 `sourceName: "udn_woman"`。
   - 維持顯示名稱「udn 女子漾」，歸類於「媒體／其他網站」（`media`）群組，確保既有資料庫歷史文章與導覽列選單無縫延續。
4. **去重與資料庫相容性**：
   - 以文章標準連結（`canonicalUrl`）作為唯一識別去重鍵，既有已抓取之歷史文章完整保留，不會產生重複或損壞。

---

## 3. 變更檔案清單 (Modified Files)

1. `lib/server/config/rss-feeds.ts`：更新 `udn_woman` 的 Feed URL。
2. `lib/server/rss/fetchPhase15Sources.test.mjs`：同步測試 fixture 之 URL。
3. `docs/specs/SPEC-20260926-UDN-WOMAN-FULL-RSS-FEED.md`：本規格文件。
4. `docs/tickets/TICKET-20260926-UDN-WOMAN-FULL-RSS-FEED.md`：追蹤 Ticket 文件。

---

## 4. 驗證標準與結果 (Verification & Results)

1. **測試套件執行**：
   - 執行 `node --test lib/server/rss/fetchPhase15Sources.test.mjs`，5 項測試全數 PASS。
2. **型別檢查**：
   - 執行 `npm run typecheck` 零錯誤。
3. **全站測試**：
   - 執行 `npm test` 確保無任何迴歸錯誤。
