# 新增 6 個政府機關新聞 RSS 來源（人事總處／客委會／內政部）

- **作者**：Claude（grill 會話）
- **日期**：2026-09-22
- **狀態**：Draft，待 worktree subagent 實作

## 1. 背景

使用者提供 11 個候選 RSS 網址，逐一查證後：

- 4 個（`www.mohw.gov.tw/rss-16-1.html`／`rss-17-1.html`／`rss-18-1.html`／`rss-101-1.html`）**已經存在**於 `RSS_FEEDS`（`code: "16"/"17"/"18"/"101"`），是完全重複的網址，不處理。
- 1 個（`siteapi.sports.gov.tw/1/News/309?handler=OpenDataRSS`，運動部）**先跳過**：實測回傳 1,871 筆、6.7MB、時間橫跨 2020-2026 年的全量歷史傾印，不是「最近 N 篇」的一般新聞 feed。試過 `$top`/`pageSize`/`top` 等常見分頁參數皆無效，跟先前已經明確拒絕過的 `hpa.gov.tw/wf/newsapi.ashx`（見本檔案下方 `rss-feeds.ts` 已有的候選查證註解區塊）同一種反模式。使用者確認之後回頭再想辦法（例如考慮寫客製爬蟲做日期截斷），這次不動。
- 其餘 6 個全部驗證為合法 RSS 2.0，本次要加入。

**本次加入的來源都用 fetch + parse 實際打過，摘要如下**（日期是 2026-09-22 查證當下）：

| code | 機關 | 分類 | url | 筆數 | guid | description 內容 |
|---|---|---|---|---|---|---|
| `dgpa_news` | 行政院人事行政總處 | 最新消息 | `https://www.dgpa.gov.tw/rsscon?uid=2` | 1 | 有（`<guid isPermaLink="false">`，數字 ID） | 完整 HTML |
| `dgpa_clarify` | 行政院人事行政總處 | 即時新聞澄清 | `https://www.dgpa.gov.tw/rsscon?uid=427` | 4 | 有 | 完整 HTML |
| `hakka_news` | 客家委員會 | 最新消息 | `https://www.hakka.gov.tw/chhakka/app/rss/News` | 20 | 無，靠 `<link>` 裡的 `serno=` 參數識別 | 完整 HTML（含客語/華語雙語段落） |
| `hakka_clarify` | 客家委員會 | 即時新聞澄清 | `https://www.hakka.gov.tw/chhakka/app/rss/NewsClarification` | 2 | 無，靠 `serno=` | 完整 HTML |
| `moi_news` | 內政部 | 新聞發布 | `https://www.moi.gov.tw/OpenData.aspx?SN=76F358C679FAD4CF` | 20 | 無，靠 `<link>` 裡的 `s=` 參數識別 | 完整 HTML |
| `moi_clarify` | 內政部 | 即時新聞澄清 | `https://www.moi.gov.tw/OpenData.aspx?SN=3A12AED6B50A9C18` | 2 | 無，靠 `s=` 參數識別；XML 有個不影響解析的 `d1p1:xsi` namespace 小瑕疵（`fast-xml-parser` 可正常解析，不必特別處理） | 完整 HTML |

沒有 `<guid>`/`NewsID` 的來源，`normalizeItem.ts` 會 fallback 到 `link` 當 `externalId`，這跟 `canonical_url` 唯一鍵幾乎同值，不會重蹈 `persistItems.ts` 文件裡記載過的「`external_id` 漂移導致誤報」舊 bug。

所有 6 支 `<description>` 都已含完整 HTML 內文（CDATA），跟先前加入的 `moe_news`（見另一個尚未合併的 PR #388，跟這次無關、不要動）同一個判斷：都設 `skipDetailFetch: true`，不用再抓詳情頁。

`moi` 的 sourceName 跟既有的 `nfa`（`內政部消防署`，內政部底下的子機關，見 `sourceLabels.ts` 的 `nfa: "內政部消防署"`）不衝突——`moi` 代表內政部本部，是不同的 sourceName。

## 2. 要加的東西

### 2.1 `lib/server/config/rss-feeds.ts`

在 `RSS_FEEDS` 陣列裡（照現有 `freeway_news`/其他純 config 項目的風格，不需要客製爬蟲）加入以下 6 筆：

```ts
{
  code: "dgpa_news",
  name: "行政院人事行政總處－最新消息",
  url: "https://www.dgpa.gov.tw/rsscon?uid=2",
  sourceName: "dgpa",
  skipDetailFetch: true,
},
{
  code: "dgpa_clarify",
  name: "行政院人事行政總處－即時新聞澄清",
  url: "https://www.dgpa.gov.tw/rsscon?uid=427",
  sourceName: "dgpa",
  skipDetailFetch: true,
},
{
  code: "hakka_news",
  name: "客家委員會－最新消息",
  url: "https://www.hakka.gov.tw/chhakka/app/rss/News",
  sourceName: "hakka",
  skipDetailFetch: true,
},
{
  code: "hakka_clarify",
  name: "客家委員會－即時新聞澄清",
  url: "https://www.hakka.gov.tw/chhakka/app/rss/NewsClarification",
  sourceName: "hakka",
  skipDetailFetch: true,
},
{
  code: "moi_news",
  name: "內政部－新聞發布",
  url: "https://www.moi.gov.tw/OpenData.aspx?SN=76F358C679FAD4CF",
  sourceName: "moi",
  skipDetailFetch: true,
},
{
  code: "moi_clarify",
  name: "內政部－即時新聞澄清",
  url: "https://www.moi.gov.tw/OpenData.aspx?SN=3A12AED6B50A9C18",
  sourceName: "moi",
  skipDetailFetch: true,
},
```

也在檔案開頭「候選來源查證但不採用」的註解區塊裡，補一筆記錄運動部的排除理由（照現有條列格式），方便以後不用重查：

```
 *   - `siteapi.sports.gov.tw/1/News/309?handler=OpenDataRSS`（運動部）回傳的不
 *     是一般新聞 feed，而是 1,871 筆、6.7MB、橫跨 2020-2026 年的全量歷史傾印；
 *     `$top`/`pageSize`/`top` 等常見分頁參數測試皆無效，跟上面 hpa.gov.tw 那筆
 *     同一種反模式，2026-09-22 先不採用，需要客製截斷邏輯才值得考慮，另開票。
```

### 2.2 `lib/server/news/sourceLabels.ts`

在 `SOURCE_LABELS` 裡加三筆（沿用 `nfa`/`moc` 等現有機關的風格，加在陣列尾端 `kuma` 之後即可）：

```ts
dgpa: "行政院人事行政總處",
hakka: "客家委員會",
moi: "內政部",
```

### 2.3 `lib/server/news/sourceCategories.ts`

在 `SOURCE_CATEGORIES` 的 `gov` 分類（`key: "gov"`）的 `sources` 陣列裡加三筆：

```ts
{ sourceName: "dgpa", label: "行政院人事行政總處" },
{ sourceName: "hakka", label: "客家委員會" },
{ sourceName: "moi", label: "內政部" },
```

### 2.4 `types/rss.ts`

在 `FeedCode` union 裡加 6 個字面量：`"dgpa_news"`、`"dgpa_clarify"`、`"hakka_news"`、`"hakka_clarify"`、`"moi_news"`、`"moi_clarify"`（放在既有 union 最後、`| (string & {})` 之前）。

## 3. 驗證（跟只看 log「執行成功」不夠——這是 `moe_familyedu` 連續 11 天回報成功但 0 篇入庫換來的教訓）

1. `npx tsc --noEmit` 過。
2. 對 6 支 feed 各自寫一支不動 DB 的乾跑腳本（只呼叫 `fetchFeedXml`/`parseFeedXml`，或用純 `fetch()` + 專案既有的 `parseFeedXml`，不要引入 `httpClient.ts`——它 `import "server-only"`，在 Next.js 執行環境外的 `tsx` 腳本會直接炸掉 `Cannot find module 'server-only'`，繞過的方法是自己用 `fetch()` 取代 `fetchFeedXml`）確認：HTTP 200、能解析出筆數、`title`/`canonicalUrl`/`externalId`/`publishedAtUtc` 正常、`externalId` 在該次抓取內無重複。
3. `npm test`/`npx eslint` 全部通過。
4. PR 說明列出 6 個來源、各自的驗證結果（筆數/HTTP 狀態）。

## 4. 注意事項

- **不要動 PR #388**（`moe_news` 教育部來源，在 `feat/moe-news-source` 分支）相關的任何東西，那是完全獨立、尚未合併的另一支改動。
- **不要加運動部或 hpa.gov.tw 那兩個被排除的來源**——只是在註解裡記錄排除理由，不是要加進 `RSS_FEEDS`。
- 這 6 個來源目前 `news_items` 裡完全沒有資料（全新來源），不涉及既有資料的遷移或清理。

## 5. 驗收標準

- 6 個來源的設定、標籤、分類、FeedCode 全部加齊。
- `npx tsc --noEmit`／`npx eslint`／`npm test` 全部通過。
- PR 說明列出 6 個來源的驗證結果。
