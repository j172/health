# TICKET-20261007: 整合《報導者》RSS 新聞來源與非營利外連導流管線

- **Ticket ID**: `TICKET-20261007-TWREPORTER-NEWS-SOURCE`
- **Issue**: #428
- **Related Specs**:
  - [SPEC-20261007-TWREPORTER-NEWS-SOURCE.md](../specs/SPEC-20261007-TWREPORTER-NEWS-SOURCE.md)
  - [news-card-destination-routing-and-no-delay-utm.md](../specs/news-card-destination-routing-and-no-delay-utm.md)
- **Status**: In Progress
- **Type**: Feature / News Pipeline
- **Date**: 2026-10-07

---

## 1. 任務概要 (Summary)

收錄非營利調查媒體《報導者》（財團法人報導者文化基金會）之全站 RSS 2.0 Feed（`https://www.twreporter.org/a/rss2.xml`），將其歸入「公益社福（npo）」分類群組，採用 `skipDetailFetch: true` 導流模式，尊重其 CC BY-NC-ND 3.0 授權，卡片點擊直連報導者原站並附帶 UTM 參數，首圖由 RSS `<enclosure>` 自動快取。

---

## 2. 驗收標準 (Acceptance Criteria)

- [x] 1. `types/rss.ts` 擴充 `FeedCode` 包含 `"twreporter_news"`。
- [x] 2. `lib/server/news/sourceLabels.ts` 註冊 `twreporter: "報導者"`。
- [x] 3. `lib/server/news/sourceCategories.ts` 於 `npo` 分類群組加入 `{ sourceName: "twreporter", label: "報導者" }`。
- [x] 4. `lib/server/config/rss-feeds.ts` 於 `RSS_FEEDS` 註冊 `twreporter_news`，設定 `skipDetailFetch: true`。
- [x] 5. `scripts/generate-source-og-images.mjs` 同步更新鏡像標籤。
- [x] 6. 建立 `tests/twreporter-rss.test.mjs` 測試並全數通過。
- [x] 7. 執行 `npm run typecheck` 與 `npm test` 驗證全站無型別與迴歸問題。
- [x] 8. 建立 PR、合併至 `main` 分支並觸發正式環境部署（closes #428）。

---

## 3. 執行檢核清單 (Checklist)

- [x] 1. 執行 GRILL ME 決策審定與收斂
- [x] 2. 建立 GitHub Issue #428
- [x] 3. 撰寫 SPEC 與 TICKET 文件
- [x] 4. 修改程式碼與設定檔
- [x] 5. 撰寫專屬測試檔 `tests/twreporter-rss.test.mjs`
- [x] 6. 本地測試與型別檢查驗證
- [x] 7. Git 提交與分支推送
- [x] 8. 合併至 `main` 並觸發 GHA 部署
