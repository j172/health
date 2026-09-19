# 新聞圖片備援缺口修復：特殊來源補上 og:image 安全網 + Google News 轉址解析

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應診斷**：`docs/specs/news-image-pipeline-findings.md` 第 2 節分類 A、B，第 3 節建議 1～3

本工單合併兩個根因不同、但都屬於「特定來源群組永遠抓不到真圖」的問題。**實作原則：盡量重用既有、已驗證過的抓圖與落地邏輯（`fetchOpenGraphImageAsset`、圖片下載/落地/命名機制），不要為這兩個問題各自平行造一套新的抓圖程式碼。**

## 1. 「特殊來源」補上 og:image 備援安全網（對應診斷報告建議 1、2）

**根因**：`processSpecialSource()`（`lib/server/rss/runIngestion.ts:212`）處理的約 51 個 `sourceName`（pchome、thenewslens、yonglin、children、sfaa、helloyishi、commonhealth_club 等）各自有自己的爬蟲邏輯決定圖片，完全不會呼叫 `fetchOpenGraphImageAsset` 做事後補圖——不像標準 RSS 路徑（`enrichItem()`）在抓不到圖時還有這一層安全網。

其中 7 個來源（對應 11 個 feed code：`pchome`×3、`thenewslens`×3 HTML 模式、`yonglin`、`children`、`sfaa`、`helloyishi`、`commonhealth_club`）共用「爬分類列表頁卡片的 `<img src>`」這個寫法（都在 `lib/server/rss/fetchExpandedSources.ts`），其中大部分列表頁用 lazy-load（真正圖網址在 `data-src`，`src` 只是共用預設縮圖），只有 `fetchSfaaNews`（第 492 行）額外讀了 `data-src`，其餘 6 個沒有——已實測證實 PChome 健康新聞分類會抓到同一張佔位圖（`article-10bc08be933f8f49fff1a7a1.jpg`）套在多篇完全不同的文章上。另外 `parseTheNewsLensRss()`（`fetchExpandedSources.ts:704-773`，Cloudflare 擋下 HTML 時的備援路徑）固定寫 `assets: []`，完全沒有任何圖片擷取邏輯。

**待辦**：
1. 在 `processSpecialSource()` 裡，比照 `enrichItem()` 既有的做法（`runIngestion.ts` 第 146-153 行），對 `assets` 為空的 item 補呼叫一次 `fetchOpenGraphImageAsset(item.canonicalUrl)`，重用現有函式，不要另寫一套。留意這會對來源網站多發一次 HTTP request，需要合理的節流/逾時（沿用 `fetchOpenGraphImageAsset` 既有的逾時設定即可，不需要額外新增）。
2. `fetchExpandedSources.ts` 裡那 6 個只讀 `.attr("src")` 的地方（`parsePchomeHtml`、`parseTheNewsLensHtml` 等），比照 `fetchSfaaNews` 的寫法補上 `|| .attr("data-src")` 的 fallback，減少一開始就抓到佔位圖的機率。
3. 承 2，即使補了 `data-src`，仍可能有殘餘的「同一張圖被同分類多篇文章共用」情況（例如列表頁模板本身就沒有縮圖）。在寫入 `news_assets` 前，加一道輕量檢查：同一 `source_name` 底下最近一批文章是否已經用過同一個圖片網址/hash，若命中則視同「沒抓到」，改觸發第 1 點的 `fetchOpenGraphImageAsset` 備援，而不是靜靜接受重複圖片。

## 2. Google News 轉址型來源的圖片死路（對應診斷報告建議 3）

**根因**：12 個 feed（`gnews`、`gnews_topic`、`nhi`、`csr_cw`、`csr_cw_social`、`esg_gvm`、`esg_businesstoday`、`ubrand_udn`、`commonhealth`、`ttvc`、`ibt`、`vghtpe_news`）的 `canonical_url` 是 `news.google.com` 轉址殼，三個獨立地方的程式碼（`lib/server/images/fetchOpenGraphImage.ts:70`、`lib/server/news/backfillOgImages.ts:53`、`scripts/gha-og-external-backfill.mjs:326`）都各自直接放棄處理這種網址——這個放棄本身合理（轉址殼頁面沒有真的 og:image），但代價是這 12 個 feed 從進站第一刻起就注定拿不到真圖。實測 `csr_cw` 30 篇裡 13 篇完全無圖、`thenewslens` 抽樣約 20/24 無圖。

**待辦**：對 `canonical_url` 命中 `news.google.com` 的 item，在嘗試抓 og:image **之前**先做一次有限跳轉次數（建議上限 3～5 跳）、短逾時的 HTTP 請求，解出 Google 轉址殼背後真正的發布站網址；解析成功就把後續的 og:image 抓取（及理想情況下，未來若要改善全文也可以用同一個解析後網址）導向這個真實網址；解析失敗則維持現狀（放棄，不倒退、不報錯拖垮整條 ingestion）。這個解析邏輯應該集中寫在一個共用函式裡，供 `fetchOpenGraphImage.ts`、`backfillOgImages.ts`、`gha-og-external-backfill.mjs` 三處共用，而不是三份各自維護一份轉址解析邏輯。

## 3. 驗收標準

- 針對第 1 節：至少用一個已知會共用佔位圖的來源（例如 PChome 健康新聞分類）驗證修復後不再對不同文章配到同一張圖 URL；補上 `fetchOpenGraphImageAsset` 備援後，原本 `assets: []` 的特殊來源文章能拿到真圖或至少嘗試過真圖抓取。
- 針對第 2 節：至少用一個已知的 Google News 轉址來源（例如 `csr_cw`）驗證能成功解析出真實文章網址並抓到對應的 og:image；解析失敗的案例要能安全降級（不拋出未捕捉例外、不影響同批次其他文章的 ingestion）。
- 不需要在本工單內調整 GHA `news-og-backfill.yml` 的排程頻率或去重複已經在跑的 cron（那是另一個議題，已在先前的排程去重疊工單處理過）。
- `npm test`／`npm run build` 通過，並為兩個新邏輯（1 的重複圖片偵測、2 的轉址解析）各補上至少一則單元測試。
