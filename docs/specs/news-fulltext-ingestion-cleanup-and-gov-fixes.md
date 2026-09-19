# 新聞全文擷取整理：清除死程式碼、卡片摘要改用 content:encoded、修復官方來源全文缺失

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應診斷**：`docs/specs/news-fulltext-fetch-findings.md` 第 2.2、2.3(b)、2.3(c) 節
- **對應使用者回報**：「10. 官方機構的新聞是否都有爬全文進來」的延伸修復（403 本身已確認是自由時報 CDN 邊緣層問題，站內無事可修，不在本工單範圍）

本工單合併三個範圍不同但都圍繞「RSS 全文擷取」的修復項目。已與使用者確認 PR #329（`feat(news,ux): 新聞卡片官方/非官方導外分流...`，commit `99723ea`）把「非官方來源一律不抓詳情頁全文」這個決策本身是**正確、刻意的設計**（非官方文章反正會直接導去原站，站內不需要全文）——**不要回滾或修改這個判斷邏輯**，本工單要做的是清理它產生的死程式碼副作用，以及修復另一批被錯誤影響到的官方來源。

## 1. 清除死程式碼：4 個非官方網域的客製化全文擷取規則

`lib/server/rss/fetchDetailPage.ts` 裡的 `DETAIL_TEXT_SCOPING`（含 2026-08-30 逐篇驗證過的字元數紀錄）針對 `mamaclub.com`、`twstreetcorner.org`、`ilady.life`、`lianhonghong.com` 這 4 個網域寫了客製化擷取規則。但這 4 個網域在 `lib/server/news/sourceCategories.ts` 都被歸類為 `media`（非官方），`isGovSource()` 一律回 false，所以 `runIngestion.ts` 的 `enrichItem()` 現在（PR #329 之後）永遠不會對它們呼叫 `fetchDetailPage()`——這些規則已確認是無法被執行到的死程式碼。

**待辦**：移除 `fetchDetailPage.ts` 裡專屬於這 4 個網域的 `DETAIL_TEXT_SCOPING` 條目與相關驗證註解。移除前務必再次確認：
- 這 4 個網域除了 `enrichItem()` 這條路徑外，沒有被其他程式碼（例如某個 special-source 爬蟲）另外呼叫到 `fetchDetailPage()`。
- 移除後 `fetchDetailPage.ts` 本身、以及任何引用這 4 個網域名稱的測試都要一併清乾淨，不要留下指向已刪除設定的殘留測試或 import。

## 2. 卡片摘要改用 RSS 的 `content:encoded` 全文欄位，而非截斷的 `<description>`

`lib/server/rss/normalizeItem.ts` 目前只從 `<description>`/`<summary>`/`<content>` 取 `descriptionHtml`，`<content:encoded>`（WordPress feed 常見，例如 mamaclub、ilady、lianhonghong）只被用來抽首圖網址，從未當作摘要/正文使用。實測 mamaclub 的 `<description>` 被截斷成約 119 字元＋刪節號，而同一個 item 的 `<content:encoded>` 其實有完整內容。

**待辦**：修改 `normalizeItem.ts`，讓 `descriptionHtml` 優先採用 `<content:encoded>`（若存在且非空），只有在來源沒有提供 `content:encoded` 時才退回目前的 `<description>`/`<summary>`/`<content>` 邏輯。**注意**：這一步**不是**要恢復對這些非官方來源做詳情頁全文抓取（第 1 節已確認那個設計不變），只是要讓「來源自己在 RSS 裡就已經廣播出來的全文欄位」被卡片摘要正確使用，改善使用者在還沒點進外站前看到的摘要品質。同時要確認這個改動不會意外把過長的 HTML（`content:encoded` 有時包含完整排版標籤）直接塞進卡片摘要顯示區塊，破版——如有需要，沿用既有的摘要截斷/清理邏輯（例如卡片顯示層原本對 `descriptionHtml` 做的截斷處理，若原本假設輸入已經很短，要一併確認截斷長度/清理規則對更長的全文輸入仍然安全）。

## 3. 修復官方來源全文缺失：亞東紀念醫院、教育部家庭教育網

`lib/server/rss/fetchFemhResearchNews.ts`（亞東紀念醫院）與 `lib/server/rss/fetchExpandedSources.ts` 內的 `parseMoeFamilyEduHtml`（教育部家庭教育網）目前都只從列表頁抓標題和連結，`detailHtml`/`detailText` 固定寫死 `null`，即使兩者的真實詳情頁都證實有完整內容（亞東已驗證：`news_detail.aspx?NewsNo=...` 回 HTTP 200、112KB）。由於兩者都是 `isGovSource()` 判定為官方的來源，`app/news/[id]/page.tsx` 會直接在站內渲染 `detail_html`，而不是導去外站——這兩者的文章目前在站內顯示「此則新聞目前沒有可顯示的完整內容」。

**待辦**：讓這兩個爬蟲在抓到列表頁項目後，額外訪問各自的詳情頁網址並擷取正文（可參考 `fetchDetailPage.ts` 既有的 `DETAIL_TEXT_SCOPING` 機制或該檔案內其他官方來源已驗證過的擷取模式，視這兩個網域的實際 HTML 結構決定要不要也在 `DETAIL_TEXT_SCOPING` 裡新增條目）。修復後應能在站內正確顯示這兩個來源的完整文章內容，不再是空白提示。

**不在本工單範圍**：`docs/specs/news-fulltext-fetch-findings.md` 第 2.3(c) 節提到的 `sfaa`（僅限透過 `fetchExpandedSources.ts` 這條路徑時）同樣只抓列表頁，但該節同時指出 sfaa 另有一條會抓全文的有效路徑（見本次批次的另一張票：退役 `gov-opendata-news-sources.ts`），兩邊的 `sfaa` 設定需要協調，不要在本工單裡單獨修 `fetchExpandedSources.ts` 那條 sfaa 路徑，留給退役那張票處理後再視情況決定是否還需要修。

## 4. 驗收標準

- 全文搜尋確認 `mamaclub.com`/`twstreetcorner.org`/`ilady.life`/`lianhonghong.com` 這 4 個網域名稱不再出現在 `fetchDetailPage.ts` 的任何抓取規則裡（歷史文件/註解裡提及不算）。
- mamaclub（或其他有 `content:encoded` 的來源）的新聞卡片摘要不再被截斷成 ~119 字元＋刪節號。
- 亞東紀念醫院、教育部家庭教育網任一篇文章的站內詳情頁能顯示完整正文，不再是「此則新聞目前沒有可顯示的完整內容」。
- `npm test`／`npm run build` 通過。
