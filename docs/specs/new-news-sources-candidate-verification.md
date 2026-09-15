# 新增候選新聞來源（查證後接入 RSS 清單）

- **Type**: 內容來源擴充 + 查證。
- **Affects**: `lib/server/config/rss-feeds.ts`
- **來源**：使用者提供 11 個候選網址

## 1. 背景

`lib/server/config/rss-feeds.ts` 目前已有約 40+ 個來源（衛福部/疾管署/食藥署/國健署官方
RSS、以及多家健康媒體，部分透過真正的 RSS feed、部分透過 Google News RSS 搜尋代理）。使用者
提供以下 11 個候選來源要加入：

```
https://www.hpa.gov.tw/wf/newsapi.ashx
https://www.h2u.io/articles
https://hiking.biji.co/index.php?q=news&page=1
https://running.biji.co/index.php?q=news&label=all
https://daypets.tw/
https://www.mohw.gov.tw/lp-2704-1-1-20.html
https://health.setn.com/
https://health.tvbs.com.tw/
https://www.nhri.edu.tw/News/index?id=b787460a34504b8181d732f7d7f0e5c5
https://www.storm.mg/channel/63/
https://edh.tw/
```

**注意**：這些網址有些看起來是網頁清單（例如 biji.co 的 `?q=news&page=1`），不一定真的有
RSS/JSON feed 可以訂閱；`https://www.hpa.gov.tw/wf/newsapi.ashx` 看起來是另一個 API 端點，
跟現有已經在用的 `hpa.gov.tw/Pages/ashx/rsspage.ashx?nodeid=...` 不是同一個，需要先查證兩者
關係（是否重複、是否更好）。`mohw.gov.tw/lp-2704-1-1-20.html` 也要先查證是否跟現有 5 個
`mohw.gov.tw/rss-*.html` 來源重疊。

## 2. 修法

**逐一查證每個網址**（不要不查證就直接假設是 RSS 硬塞進設定檔）：

1. 對每個網址，實際打開確認：是否有對應的 RSS/Atom/JSON feed 端點（很多新聞網站的頁面本身
   不是 feed，但會在 `<link rel="alternate" type="application/rss+xml">` 或固定路徑
   如 `/feed`、`/rss` 提供真正的 feed）。
2. 若該來源**沒有**任何可訂閱的 feed 格式，只有網頁——**不要**為了硬塞而去寫網頁爬蟲/HTML
   parser；改為在 PR 描述中明確列出「此來源無 feed，需要另外的爬蟲方案，不在本次範圍內」，
   交由使用者決定要不要另開一張需要爬蟲的 ticket。
3. 對 `hpa.gov.tw/wf/newsapi.ashx` 與 `mohw.gov.tw/lp-2704-1-1-20.html`，先確認是否與現有
   `rss-feeds.ts` 裡已經存在的同機關來源重複；若重複就不要重複加入，只需在 PR 描述中說明
   「已有等效來源，未重複新增」。
4. 對確認**真的有**可用 feed 格式、且不跟現有來源重複的來源，比照 `rss-feeds.ts` 現有的
   `name`/`url` 格式加入設定檔。加入時沿用檔案既有的分類/註解慣例（若檔案有依機關/媒體分組
   的結構，新項目放進對應分組）。
5. 執行既有的 RSS 擷取相關測試（`lib/server/rss/*.test.mjs` 等）與 `npm run build` 確保沒有
   語法或型別錯誤。

## 3. 驗收

- PR 描述附上**逐一查證結果表**：11 個來源各自的查證結論（有效 feed 已加入 / 與現有來源重複
  未加入 / 無 feed 格式需要爬蟲另開 ticket），不能籠統帶過。
- 真正加入的來源，其 feed URL 必須是實際查證過、能正常回應的，不是憑網站名稱猜測拼出來的路徑。
- 不影響現有 40+ 個既有來源的設定。

---
🤖 Generated with [Claude Code](https://claude.com/claude-code)
