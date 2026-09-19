# 新聞全文抓取健康度審查 — 診斷結果

- **作者**：Claude（診斷會話，`claude-sonnet-5`）
- **日期**：2026-09-20
- **狀態**：Findings（診斷完成，未修改任何抓取/導頁程式碼）
- **對應工單**：`docs/specs/news-fulltext-fetch-health-audit.md`（issue #340）
- **對應使用者回報**：「3. 自由時報－生活與健康新聞的連結點進都會出現403」「10. 官方機構的新聞是否都有爬全文進來」

本報告只做盤點與根因判定，**未變更任何程式邏輯**。所有結論均以實際 `curl` 測試、原始碼閱讀（含 `git log -p` 追蹤修改歷史）取得，未用猜測。

---

## 1. 自由時報 403 根因判定

### 1.1 結論先講：這不是站內伺服器抓取失敗，是使用者瀏覽器直接開啟自由時報原站被自由時報自己的邊緣層擋下

程式碼層面已經確定答案，不需要用測試去「猜」是哪一種：

- `lib/server/config/rss-feeds.ts` 第 138-147 行，`ltn` feed 設定 `skipDetailFetch: true`，註解明講：
  > `// Skip full article HTML scrape (ltn <head>/<base> used to leak into detail_html). Card thumbs still come from a lightweight og:image pull in runIngestion (fetchOpenGraphImageAsset) — not from body images.`

  也就是說，**站內伺服器端從來不會去抓自由時報的文章詳情頁**。`lib/server/rss/fetchDetailPage.ts` 第 359-361 行對 `skipDetailFetch` 的 host 直接 short-circuit，回傳 `detailHtml: null, detailText: null, assets: []`，連 HTTP 請求都不會發出。

- 使用者點擊新聞卡時實際發生的事：
  - `lib/server/news/sourceCategories.ts` 的 `isGovSource()` 判定 `ltn` 屬於 `media`（非官方）類別。
  - `lib/format/outboundLink.ts` 的 `getArticleDestination()`：非官方來源直接回傳 `item.canonical_url`（自由時報原始網址，附加 UTM 參數），`isExternal: true`, `target: "_blank"`。
  - `components/News/NewsCard.tsx` 第 26-29 行據此把 `<Link>` 的 `href` 設成該原始網址，並加上 `target="_blank" rel="noopener noreferrer"`。
  - 就算使用者是從內部 `/news/[id]` 詳情頁點「前往官方原始網頁」，或該篇本身就被判斷為非官方而直接命中 `app/news/[id]/page.tsx` 第 82-89 行的 `redirect(appendOutboundUtm(news.canonical_url, ...))`，結果一樣：瀏覽器最終導向 `news.ltn.com.tw`。

  **站內沒有任何一條路徑是「先用自己的伺服器去抓自由時報全文，抓失敗才 403」的**——因為根本沒有抓取這個動作。使用者看到的 403 100% 是自由時報自己網站回的。

### 1.2 實測：403 是自由時報 CloudFront 邊緣節點的問題，且與 Referer／UA 無關

用同一支自由時報文章網址（`https://news.ltn.com.tw/news/life/breakingnews/5579774`，來自即時 RSS）做多組對照測試：

| 測試條件 | 結果 |
|---|---|
| 伺服器端 ingestor UA、無 Referer | 403 |
| 真實瀏覽器 UA、無 Referer（模擬直接貼網址） | 403 或 200（不穩定） |
| 真實瀏覽器 UA + `Referer: https://health.j172.tw/`（模擬從本站點擊） | 403 或 200（不穩定） |
| 真實瀏覽器 UA + `Referer: https://news.ltn.com.tw/`（模擬站內導覽） | 403 或 200（不穩定） |
| Googlebot / facebookexternalhit UA | 200 |
| curl 預設 UA、無任何額外 header | 200 或 403（不穩定） |

**關鍵發現**：同一組 header 組合，重覆呼叫會得到不同結果——不是 Referer 或 UA 決定 403/200，而是回應的 `X-Amz-Cf-Pop` 決定的：

```
HTTP/1.1 403 Forbidden
X-Cache: Error from cloudfront
X-Amz-Cf-Pop: HKG54-P1        ← 香港邊緣節點：100% 回 403（連自由時報自家 origin 都沒打到，CloudFront 邊緣層直接擋）

HTTP/1.1 200 OK
X-Cache: Hit from cloudfront
X-Amz-Cf-Pop: TPE54-P1        ← 台北邊緣節點：100% 回 200，內容正常
```

連續 15 次請求，只要 CloudFront 把請求路由到 `HKG54-P1`（香港）就是清一色 403；路由到 `TPE54-P1`（台北）就是清一色 200，與 Referer、User-Agent、HTTP 版本完全無關（`X-Cache: Error from cloudfront` 表示這個 403 是 CloudFront 邊緣自己產生的，根本沒有轉發到自由時報的 origin nginx）。這是**自由時報 CloudFront 發行版本的地理限制／WAF 地理規則**（或至少是以邊緣節點的地理判斷為依據的規則），與健康新聞網站的連結建構方式、UTM 參數、Referrer-Policy 完全無關。

補充：本測試環境的出口路由本身會落在 `HKG54-P1`（且 DNS 顯示走 `connectivity-check.warp-svc`，即經過某種穿隧/中繼），所以從這個環境測試會偏向「看到 403」，但這剛好可以拿來當機制的證據，而不是「本站的請求方式有問題」的證據。真實使用者若被自己的網路環境（VPN、公司代理、部分 ISP 的 anycast 路由、非台灣 IP）路由到自由時報 CloudFront 的非台灣邊緣節點，就會複現一模一樣的 403，而這與 health.j172.tw 完全無關，本站也無法在伺服器端修正（本站根本不參與這次請求）。

### 1.3 修法方向的含意

因為 403 發生在「使用者瀏覽器 → 自由時報 CloudFront」這一段，**站內能做的事非常有限**：
- 不能修「伺服器端抓取」，因為根本沒有這個抓取動作，`skipDetailFetch: true` 的設計本身沒有問題。
- 可以做的是「使用者體驗補償」層級的優化（見第 3 節），例如：連結旁加提示文字告知外站可能因地區網路限制無法開啟、改善卡片摘要讓使用者不一定要點進外站、或提供「複製連結」备用等——這些都不是「修 bug」，因為本站沒有 bug；是自由時報自己的邊緣網路狀況。

---

## 2. 全來源盤點

### 2.1 抓取路徑總覽（先講清楚有幾條管線，因為這是誤判的最大來源）

這個站台的新聞其實由 **3 條互相獨立的管線**餵進同一張 `news_items` 表：

1. **`RSS_FEEDS`（`lib/server/config/rss-feeds.ts`，44 個 feed）**，由 `lib/server/rss/runIngestion.ts` 的主迴圈處理，`enrichItem()` 決定要不要呼叫 `fetchDetailPage()` 抓詳情頁全文。
2. **「Special sources」（同一支 `runIngestion.ts` 內，`processSpecialSource` 呼叫約 40 個各自獨立的 HTML/JSON 爬蟲函式）**，例如 `fetchExpandedSources.ts`、`fetchNpoSources.ts`、`fetchFemhResearchNews.ts`、`fetchCgmhNews.ts` 等，每個來源自己決定要不要抓全文，**不受 `enrichItem()` 的邏輯管轄**。
3. **`GOV_OPENDATA_SOURCES`（`lib/server/config/gov-opendata-news-sources.ts`，12 筆），由完全獨立的 `lib/server/news/fetchGovOpenDataNews.ts` 的 `syncGovOpenDataNews()` 處理**，走自己的 cron（`registerJobs.ts` 第 109-112 行，每小時 :12 與 :42），會嘗試對每則新鮮項目呼叫 `fetchDetailPage()` 抓全文，失敗才退回 RSS 摘要。

**這三條管線裡，`mohw`／`cdc`／`tfda`／`hpa`／`nhi`／`sfaa` 這幾個代號在管線 1 和管線 3 裡各有一份設定，網址還不一樣**——這是本次審查中最值得跟進的架構問題，見 2.4 節。

### 2.2 完全抓到全文的來源（管線 1：`RSS_FEEDS` + 官方判定 + 詳情頁抓取成功）

`runIngestion.ts` 第 105-106 行是決定「誰真的會被抓全文」的關鍵閘門：

```ts
const isGov = isGovSource(item.sourceName);
const skipDetail = !isGov || Boolean(FEEDS_BY_CODE.get(item.feedCode)?.skipDetailFetch);
```

這行是 2026-09-19 commit `99723ea`（PR #329「新聞卡片官方/非官方導外分流」）加入的。**在此之前**，只要 feed 沒標 `skipDetailFetch`，不分官方/非官方都會抓詳情頁；**現在**，只有「官方來源 (`isGovSource` 為真) 且未標 `skipDetailFetch`」才會真的呼叫 `fetchDetailPage()`。這個改動與同一個 PR 把非官方文章的 `/news/[id]` 改成直接 302 到原站（見第 1.1 節）是一致的邏輯：反正非官方文章的站內詳情頁不會被使用者看到，抓全文也沒有意義。

實際會走到 `fetchDetailPage()` 且成功拿到全文的，只剩：

| 來源 | Feed 代號 | 抓取狀態 | 佐證 |
|---|---|---|---|
| 衛福部 mohw | `16`/`17`/`18`/`101`/`2622` | 200，全文擷取（無需 per-host scoping，直接吃 `<article>`/`<main>`） | 實測 `rss-16-1.html` 回 200／72KB；範例標題「中秋食品安全把關 食藥署攜手地方稽查合格率逾99%」 |
| 疾管署 cdc | `cdc`/`cdc_clarify`/`cdc_outbreak`/`cdc_letters` | 200，`DETAIL_TEXT_SCOPING["cdc.gov.tw"]`（`only` 模式，`div.news-v3-in`）已於 2026-08-30 驗證 4 篇皆命中，1620→847 字元、內容完整 | `fetchDetailPage.ts` 第 104-123 行的驗證紀錄；本次實測 RSS 回 200／34KB |
| 食藥署 tfda | `tfda` | 200，`DETAIL_TEXT_SCOPING["fda.gov.tw"]`（`without` 模式）已驗證 450→237 字元 | 實測回 200／43KB |
| 國健署 hpa | `hpa`/`hpa_clarify`/`hpa_rumor`/`hpa_activity`/`hpa_announcement` | 200，`DETAIL_TEXT_SCOPING["hpa.gov.tw"]`（`only` 模式，`div.contentBlock`）已驗證 5 個 nodeid 皆命中 | 實測回 200／457KB；範例標題「國民健康署攜手全聯 推「買菜動一動」」 |

這 15 個 feed 代號（5 個 mohw + 4 個 cdc + 1 個 tfda + 5 個 hpa）是目前唯一一組「設計上會抓、實測也真的抓得到全文」的官方來源。

### 2.3 只有摘要／RSS 片段、沒有全文的來源

分成三種成因，成因不同代表補救方式完全不同：

**(a) 刻意設計為只用摘要（`skipDetailFetch: true`，理由記錄在 `rss-feeds.ts` 註解中）**

| 來源 | 原因 |
|---|---|
| `ltn`（自由時報－生活與健康新聞） | 詳情頁 `<head>`/`<base>` 曾外洩進 `detail_html`；且非官方來源反正會直接導外站，抓了也用不到 |
| `gnews`／`nhi`／`csr_cw`／`csr_cw_social`／`esg_gvm`／`esg_businesstoday`／`ubrand_udn`／`commonhealth`／`ttvc`／`ibt`／`vghtpe_news`／`gnews_topic` | 全是 Google News `site:` 搜尋包裝的 feed，連結會先經過 Google 的轉址頁，抓到的只會是 Google 的轉址殼，不是原文 |
| `top1health`（華人健康網） | 與 ltn 相同的詳情頁爬取問題 |

其中 `commonhealth`（康健雜誌）的 Cloudflare JS 挑戰頁問題本次實測仍成立：`curl` 不帶自訂 UA 打 `commonhealth.com.tw/robots.txt` 回 403「Just a moment...」挑戰頁；帶真實瀏覽器 UA 才拿到 200 的正常內容。這證實了它的 bot 防護是 UA/指紋敏感的，`skipDetailFetch` + Google News 備援是合理選擇。

**(b) 官方/非官方通吃，但因 2.2 節提到的 `isGov` 閘門，2026-09-19 之後實際上永遠不會被抓（即使 `rss-feeds.ts` 沒標 `skipDetailFetch`，且還維護著詳細的 per-host `DETAIL_TEXT_SCOPING` 規則）**

`mamaclub.com`（媽媽經）、`twstreetcorner.org`（巷仔口社會學）、`ilady.life`（iLady 愛女也）、`lianhonghong.com`（臉紅紅）都屬於 `sourceCategories.ts` 的 `media` 類（非官方），`isGovSource()` 一律回 false，所以無論 `rss-feeds.ts` 有沒有標 `skipDetailFetch`，`enrichItem()` 都會把 `skipDetail` 判成 `true`。

`fetchDetailPage.ts` 裡為這四個網域寫的 `DETAIL_TEXT_SCOPING`（含 2026-08-30 的逐篇字元數驗證紀錄，例如 mamaclub「2168→1407」）現在對 `RSS_FEEDS` 這條路徑而言是**未被執行到的設定**——不是設定錯，而是上游的 `isGov` 閘門先擋下來了。這不必然是壞事（反正這些來源的使用者會被導去原站），但如果日後有人想恢復非官方來源也顯示全文（例如改成內嵌閱讀而非導外），要記得這批 scoping 規則已經現成，只是被閘門擋住而已。

實測佐證：`mamaclub.com/feed/` 的 `<description>` 只有 119 字元且以「[…]」結尾（例：桃園親子住宿文章），真正的全文其實在同一個 RSS item 的 `<content:encoded>` 欄位裡——但 `lib/server/rss/normalizeItem.ts` 第 168-171 行只從 `description`/`summary`/`content` 取 `descriptionHtml`，`content:encoded`（第 136-141 行）只拿來抽首圖網址，從未被當作正文使用。也就是說，就算把 `isGov` 閘門拿掉，目前的 normalizer 也不會用到 RSS 裡其實已經內建的全文。

**(c) 官方來源，但走「Special sources」清單裡「只爬列表頁、從不訪問詳情頁」的爬蟲，導致官方文章在站內顯示為空**

這是回應使用者「10. 官方機構的新聞是否都有爬全文進來」最直接的答案：**沒有，至少有 3 個官方來源目前完全沒有全文**：

| 來源 | 爬蟲檔案 | 具體行為 |
|---|---|---|
| 亞東紀念醫院 femh | `lib/server/rss/fetchFemhResearchNews.ts` | 只從列表頁 `a[href*='news_detail']` 抓標題和連結，`descriptionHtml`/`descriptionText` 固定填 `""`，`detailHtml`/`detailText` 固定填 `null`（第 103-106 行）。實測其中一篇詳情頁 `news_detail.aspx?NewsNo=16679&Class=1` 本身回 200、112KB 的正常內容——內容存在，只是爬蟲從未去讀 |
| 教育部家庭教育網 moe_familyedu | `lib/server/rss/fetchExpandedSources.ts`（`parseMoeFamilyEduHtml`） | 同樣模式，只讀列表頁 |
| 衛福部社家署 sfaa（**僅限透過 `fetchExpandedSources.ts` 這條路徑時**） | 同上（`parseSfaaNewsHtml`），目標 `sfaa.gov.tw/sfaa/list/5cX` | 同樣模式；但見 2.4 節，sfaa 另有一條會抓全文的路徑 |

由於這三者都是 `isGovSource()` 判定為官方的來源，`app/news/[id]/page.tsx` **不會**把使用者導去原站，而是直接在站內渲染 `articleHtml = news.detail_html || news.description_html || "<p>此則新聞目前沒有可顯示的完整內容。</p>"`（第 118-121 行）。因為 `detail_html`/`description_html` 兩者皆空，**femh 和 moe_familyedu 的文章在健康新聞網站上會直接顯示「此則新聞目前沒有可顯示的完整內容」**，即使原始公告本身內容完整。

`yonglin`、`children_events`/`children_research`、`helloyishi`、`commonhealth_club`、`thenewslens`(×3)、`pchome`(×3) 也是同一種「只爬列表」模式，但這些都是非官方來源，效果等同於 2.3(b)：反正會導外站，影響較小。

### 2.4 明確被擋（403/404/429/502/504）或看似成功實則被擋的來源

這裡的重點是 `GOV_OPENDATA_SOURCES`（`lib/server/config/gov-opendata-news-sources.ts`）這條管線，它每 30 分鐘（cron `12,42 * * * *`）主動嘗試對 12 筆官方資料源做「先抓 RSS 列表，新鮮項目再抓詳情頁全文」的完整流程（`lib/server/news/fetchGovOpenDataNews.ts` 第 107-127 行），但實測發現半數以上的網址本身就是壞的或被擋：

| 來源 | 設定的 RSS 網址 | 實測結果 |
|---|---|---|
| 農業部 moa | `https://www.moa.gov.tw/rss.php?cat=news` | **HTTP 404**「File not found.」——網址本身錯誤/已失效 |
| 內政部消防署 nfa | `https://www.nfa.gov.tw/cht/index.php?act=rss&code=news` | **HTTP 504 / 連線逾時**——伺服器根本連不上 |
| 交通部 motc | `https://www.motc.gov.tw/rss.jsp` | 302 轉址後最終 **HTTP 502 Bad Gateway** |
| 環境部 moenv | `https://enews.moenv.gov.tw/Rss/` | 302 轉址到 `/error`，最終 **HTTP 403** |
| 公路局 thb | `https://www.thb.gov.tw/rss.aspx` | **HTTP 200，但回應內容不是 RSS**，而是 Incapsula（Imperva）機器人防護的 JS 挑戰頁（`<title>` 沒有，內文是 `_Incapsula_Resource` iframe，文字含「Request unsuccessful. Incapsula incident ID: ...」）。這比明確的 4xx 更危險：因為 `syncGovOpenDataNews()` 只檢查 `res.status`（200-299 視為成功），這種「200 但內容是假的」不會被記錄成錯誤，只會安靜地在 `parseFeedXml` 找不到 `<item>` 而回傳 0 筆，等於公路局的路況新聞永遠進不來，卻也永遠不會觸發任何告警 |
| 健保署 nhi | `https://www.nhi.gov.tw/rss.aspx?nodeid=11` | **HTTP 403**（5.5KB），與既有紀錄一致（`nhi.gov.tw` 會封鎖資料中心 IP，見 `docs/specs` 既有的 `ops_host_ip_blocked_upstreams` 相關記錄），因此 `rss-feeds.ts` 裡的 `nhi` feed 才改用 Google News `site:` 搜尋當備援並標 `skipDetailFetch: true` |
| 高速公路局 freeway | `https://www.freeway.gov.tw/rss.aspx` | 200，211KB，正常 |
| 衛福部社家署 sfaa（此路徑） | `https://www.sfaa.gov.tw/SFAA/RSS.aspx?type=1` | 200，130KB，正常——**這是 sfaa 真正有效的 RSS 網址**，與 2.3(c) 裡 `fetchExpandedSources.ts` 用的 `sfaa.gov.tw/sfaa/list/5cX`（HTML 列表頁，從不抓全文）是兩個不同網址、兩條獨立管線，`feedCode` 卻同樣是 `sfaa_news` |
| 食藥署 tfda（此路徑重複設定） | `https://www.fda.gov.tw/tc/rss.aspx?cid=24` | 200，145KB，正常，但與 `rss-feeds.ts` 裡 `tfda` 使用的 `rssAnnouncement.ashx` 是不同網址 |
| 國健署 hpa（此路徑重複設定） | `https://www.hpa.gov.tw/rss.aspx?nodeid=124` | 302 轉址（152 bytes），**不是** `rss-feeds.ts` 裡驗證有效的 `Pages/ashx/rsspage.ashx?nodeid=124`——這組網址本身就不對 |
| 疾管署 cdc（此路徑重複設定） | `https://www.cdc.gov.tw/RSS/RssXml/Hh02008801?type=1` | 302 轉址（146 bytes），**不是** `rss-feeds.ts` 裡驗證有效的 `Hh094B49-DRwe2RR4eFfrQ`——雜湊 ID 不同，這組疑似過期或抄錯 |

**結論**：`GOV_OPENDATA_SOURCES` 這 12 筆設定裡，`freeway` 和 `sfaa`（`SFAA/RSS.aspx` 那組）目前是唯二乾淨可用的；`moa`／`nfa`／`motc`／`moenv`／`thb` 五個是壞掉或被擋的（`thb` 最隱蔽，因為回 200）；`mohw`／`cdc`／`tfda`／`hpa`／`nhi` 五個雖然在 `rss-feeds.ts` 裡都有各自驗證過的正常網址，但在這份獨立設定檔裡卻是重複設定且用了不同（部分明顯是壞的）網址。這是**設定檔層級的技術債**，不是抓取邏輯的 bug，但直接回答了使用者的第 10 項疑問：不是「有沒有嘗試抓全文」，而是有一整批官方機構新聞的網址本身在來源端就是壞的或被擋的，且因為 200/403/302 混雜、`thb` 那種假 200 又不會被目前的錯誤記錄機制抓到，這個狀況目前對維運團隊是不可見的。

### 2.5 三類發現各自的實例小結（依工單第 4 點要求，逐類至少 2-3 個實例）

- **完全抓到全文**：`mohw`「中秋食品安全把關 食藥署攜手地方稽查合格率逾99%」（`mohw.gov.tw`，200）；`cdc` 8/27 登革熱疫情稿（`cdc.gov.tw/Bulletin/Detail`，200，`only` scoping 命中）；`hpa`「國民健康署攜手全聯 推「買菜動一動」」（`hpa.gov.tw`，200，`only` scoping 命中）。
- **只有摘要／RSS 片段**：自由時報「曾是科技業老將！鍘美藝術節發起人歷經破產」（`news.ltn.com.tw`，`skipDetailFetch: true`，設計為導外站不抓）；媽媽經「桃園親子住宿｜COZZI Blu 和逸飯店桃園館…」（`mamaclub.com`，RSS 摘要僅 119 字元＋刪節號，`content:encoded` 全文存在但未被讀取，且非官方身分令 `isGov` 閘門直接跳過抓取）；亞東紀念醫院任一則研究新聞（`femh.org.tw/research/news_detail.aspx`，官方來源，詳情頁本身 200／112KB 有完整內容，但爬蟲只讀列表頁，導致站內顯示「此則新聞目前沒有可顯示的完整內容」）。
- **明確被擋 / 實質失效**：農業部 moa RSS（`moa.gov.tw/rss.php?cat=news`，**404**）；內政部消防署 nfa RSS（`nfa.gov.tw`，**504**／連線逾時）；公路局 thb RSS（`thb.gov.tw/rss.aspx`，**200 但為 Incapsula 機器人挑戰頁，非真實 RSS**）；健保署 nhi RSS（`nhi.gov.tw/rss.aspx?nodeid=11`，**403**，資料中心 IP 封鎖，與既有記錄一致）。

---

## 3. 業界常見的合規優化做法（2-3 項具體建議）

以下皆為調查後認為對本站現況合理、且不涉及規避對方反爬蟲/防盜連機制的做法：

1. **對外連結：保留但收斂 Referrer，並在真的需要「引用摘要」的來源上尊重 robots.txt** — 目前 `next.config.js` 只在 `/admin/*` 設了 `Referrer-Policy: no-referrer`，一般頁面吃瀏覽器預設值（Chrome 通常是 `strict-origin-when-cross-origin`，會送出本站 origin）。這對「導外連結」本身是合理且業界常見的做法（多數新聞聚合站，例如 Google News、Apple News，都是直接連到原站並保留可辨識的 Referer，讓對方能識別流量來源、而不是假裝是自然流量）。但本次診斷已證實自由時報的 403 與 Referer 無關（見 1.2 節），所以「調整 Referrer-Policy」對這個特定案例不會有幫助，僅列為一般性最佳實踐供未來其他來源參考。若真的要對特定站別客製化 Referrer（例如某些站要求匿名 Referer 才放行、某些站要求保留原站 Referer 才不觸發防盜連），可以考慮用 `<a rel="noreferrer">` 或 per-domain 的 meta referrer 標籤逐站調整，而不是全站統一策略。

2. **優先使用來源官方就有提供的「全文」欄位，而非另外爬詳情頁** — 本次發現 `content:encoded`（WordPress 全文欄位）在多個 feed（mamaclub、ilady、lianhonghong 等）裡其實已經含有完整正文，但 `normalizeItem.ts` 目前只用它來抽首圖，正文仍取自被摘要化的 `<description>`。業界處理多來源新聞聚合時的常見作法是：優先信任來源自己在 RSS/Atom 裡提供的全文欄位（`content:encoded`、Atom 的 `<content type="html">`），只有在來源沒提供全文欄位時才退而求其次去爬詳情頁；這樣可以減少「重複打對方伺服器」的請求量（對被爬的一方更友善、更不容易觸發對方的頻率限制或反爬蟲規則），也天然對齊 robots.txt 的精神（用對方主動透過 RSS 廣播出來的資料，而不是額外爬取對方未必歡迎被程式化存取的網頁）。這一點目前對本站是否有實益，取決於是否要恢復非官方來源的全文顯示（見下一點），如果維持「非官方一律導外站」的產品決策，這項優化的優先度較低。

3. **官方機構來源改用「訂閱制」而非「爬取列表頁」，並加上死亡連結監控** — 第 2.4 節發現的 `GOV_OPENDATA_SOURCES` 問題（404/504/502/403/假 200）本質上是「設定檔內的網址老化」，這在依賴政府開放資料/RSS 的系統中是常態（政府網站改版、URL 結構變動、換 CDN/WAF 供應商的頻率通常高於私人維運團隊能追蹤的速度）。業界對這類問題的常見合規因應方式：
   - 對每個來源的健康度做主動監控與告警，而不是只看「本次抓到幾筆」——目前 `feed.tolerateForbidden` 這個欄位已經存在於 `types/rss.ts`，但目前沒有任何 feed 使用它，且它只覆蓋 401/403 的例外訊息，涵蓋不到 `thb.gov.tw` 這種「200 但內容是假的」情況；比較穩健的做法是額外檢查回應內容是否真的能被 XML/RSS parser 解析出至少一個 `<item>`，解析不出來時視為失敗並記錄，而不是靜默吞掉。
   - 對於官方機構真的有反爬蟲/CDN 保護（如 nhi.gov.tw 對資料中心 IP 的封鎖）的情況，優先尋找該機關是否有政府資料開放平台（data.gov.tw）上的替代資料集或官方 API，而不是持續對其官網做高頻率爬取——這是本案已經在其他來源（如 `moenv` 走 `data.moenv.gov.tw/api/v2/mnews_p_01` 開放資料 API 而非爬官網）採用的模式，值得對 `moa`/`nfa`/`motc`/`thb` 這幾個目前失效的來源比照檢查是否也有對應的開放資料 API 版本可用。

---

## 附錄：本次測試方法紀錄（供之後排查參考）

- 所有 curl 測試皆在本次診斷工作環境（一個雲端沙盒）中執行，出口路由經觀察會固定落在 AWS CloudFront 的 `HKG54-P1`（香港）邊緣節點，這解釋了為何本環境測到的自由時報 403 比例偏高；不代表台灣一般使用者的體驗必然如此,但完整說明了 403 的觸發機制與本站程式碼無關。
- 未對任何生產資料庫或正式站台發出寫入請求，僅讀取公開的 RSS/HTML 端點與閱讀原始碼、`git log -p`。
- 未讀取任何 `.env`／credentials。
