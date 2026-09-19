# 新聞卡片抓圖流程診斷報告：調查結果

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Findings delivered（僅供人工複核，未修改任何抓圖程式邏輯）
- **對應文件**：`docs/specs/news-image-pipeline-audit.md`
- **對應使用者回報**：「4. 新聞卡片大部分都還是沒有抓到正確圖片」

## 0. 調查方法與資料來源限制（先講清楚，避免誤讀後面的數字）

本次調查**沒有取得 production MySQL 或 `/api/admin/news-images` 的存取權**：

- worktree 沙盒內只有 `.env.example`（無真實 DB 帳密），沒有可用的 `.env`。
- `/api/admin/news-images` 需要 `RSS_SYNC_ADMIN_SECRET`，本環境未持有、也不應該去取得或猜測它。
- 沙盒對外網路被阻擋（`curl` 直接 timeout / exit 28），僅有 `WebFetch`/`WebSearch` 兩個工具能存取外部網路。

因此本報告的「抽樣調查」是**透過 `WebFetch` 對 `https://health.j172.tw` 的公開頁面（`/news`、`/news?source=`、`/news?group=`、`/news/<id>`）取樣**，人工比對頁面上實際渲染出的 `<img>` / `/_next/image?url=...` 路徑，並回頭對照原始碼判斷成因。這代表：

- **能確定的**：某個來源、某篇文章目前在公開頁面上顯示什麼圖（真實照片 / 通用圖庫圖 / 完全沒圖 / 同一張圖重複出現），以及對照程式碼後這個現象「為什麼會發生」。
- **不能確定的**：全站精確的百分比（例如「所有新聞的 38% 沒有圖」）。沒有 DB 就無法對 `news_items` 全表做 COUNT/GROUP BY，下面所有比例都是「單次樣本觀察」，只用來佐證某個根因存在、而非做全站統計推論。
- 抽樣時間點：2026-09-20，透過 `/news`（首頁）、`/news?source=udn_health`、`/news?source=ettoday`、`/news?source=health_gvm`、`/news?group=npo`、`/news?source=csr_cw`、`/news?source=thenewslens`、`/news?source=mirrormedia_healthnews`、`/news?group=gov`、`/news?page=40`（較舊分頁）等頁面各抽 10～30 筆，共約 220 筆。

以下第 1 節是純程式碼盤點（可 100% 確認），第 2 節是「程式碼盤點 + 實際線上樣本互相印證」的根因分類。

---

## 1. 目前抓圖流程總覽（資料流）

新聞從進站到卡片顯示，實際上是 **兩條完全不同的進站路徑 + 三層事後補圖機制 + 兩種顯示邏輯**，比對外部稽核文件（`docs/specs/news-freshness-gate.md`、`docs/specs/detail-page-source-survey.md`）原先預期的單一 pipeline 複雜得多。

### 1.1 進站階段：兩條路徑，只有一條有「補圖安全網」

**路徑 A — 標準 RSS feed（`lib/server/config/rss-feeds.ts` 內定義、由 `runIngestion.ts` 的 `enrichItem()` 處理，約 30+ 個 feed）**

```
RSS/XML 進站
  → enrichItem()  (lib/server/rss/runIngestion.ts:102-175)
    1. isGov = isGovSource(source)
       skipDetail = !isGov || feed.skipDetailFetch
       （白話：只有「政府機關來源」且未被標記 skipDetailFetch 才會真的爬詳情頁；
         其餘一律跳過 fetchDetailPage）
    2. 若 skipDetail=false → fetchDetailPage() 爬 <article>/<main> 內文圖
    3. 若還是沒圖，且 RSS 本身帶 enclosure/media:content（leadImageUrl）
       → downloadArticleImage() 下載並落地存成 /images/news/articles/*.{jpg,png,webp,gif}
    4. 若還是沒圖 → fetchOpenGraphImageAsset(canonicalUrl)
       （lib/server/images/fetchOpenGraphImage.ts）
       抓 og:image / twitter:image / json-ld image，下載落地
       ⚠️ 但這一步對 news.google.com 網址直接 return null（見 1.3）
```

**路徑 B — 「特殊來源」自製爬蟲（`processSpecialSource()`，`lib/server/rss/runIngestion.ts:212-290`，約 50 個 feed code、橫跨 ~51 個 `sourceName`：`pchome`、`thenewslens`、`mirrormedia_healthnews`、`udn_health`、`setn`、`ettoday`(部分)、`healthnews`、`fiftyplus`、`helloyishi`、`commonhealth_club`、`moc`、`shih_hsin`、`uniqman`、`sfunhk`、`letsharu`、`istyle_lovesex`、`tvbs_health`、`uho`、`cgmh`、`femh`、`sungful`、`mamibuy`、`tasctaiwan`、`tase`、`edh`、`healthbw`、`nhi`、`moenv`、`yonglin`、`children`、`sfaa`、`moe_familyedu` 及 25 個 NPO 來源等）**

```
自製 fetcher（各自的 fetchXxx.ts / fetchExpandedSources.ts 內的函式）
  → 直接回傳 EnrichedRssItem[]（含各自决定好的 assets）
  → processSpecialSource() 只做「新鮮度過濾 + AI SEO」，
     **完全不會呼叫 fetchOpenGraphImageAsset 做事後補圖**
```

這是本報告最重要的一個結構性發現：**「特殊來源」路徑天生沒有路徑 A 第 4 步那個「還是沒圖就去抓 og:image」的安全網**。只要該來源自己的爬蟲邏輯抓不到圖（或抓錯圖），這篇文章就永久停在那個狀態，直到後面第 3 層事後補圖（`news-og-backfill.yml`）撿到它為止——而該工作流程同樣會排除 `news.google.com` 網址（見 1.3、2.1）。

在「特殊來源」裡，又可以再分兩種寫法：

- **有自己專屬的單篇文章解析邏輯**（例如 `fetchMirrorMediaExternals.ts`、UDN/TVBS/SETN 系列）：多半品質不錯，實測抽樣幾乎都是真實照片。
- **只是把「分類列表頁」卡片上的 `<img src>` 撈出來當文章圖**（`fetchExpandedSources.ts` 內共用同一種 `anchor.find("img").attr("src")` 寫法，涵蓋 `parsePchomeHtml`（PChome ×3 feed）、`parseTheNewsLensHtml`（關鍵評論網 ×3 feed）、`fetchYonglinNews`、`fetchChildrenEvents`、`fetchSfaaNews`、`fetchHelloYishiHealth`、`fetchCommonHealthClub`）：這種寫法有兩個已知弱點，且都在線上樣本中被實際觀察到（見 2.2、2.3）：
  1. 列表頁如果用 lazy-load（真正圖網址在 `data-src`，`src` 只是一張共用的預設縮圖），只讀 `.attr("src")` 就會抓到「每篇文章都一樣」的那張共用圖。只有 `fetchSfaaNews`（第 492 行）額外讀了 `data-src`，其餘 6 個来源都沒有。
  2. 列表頁的卡片本來就不是每則都帶縮圖（純文字快訊），抓不到就是 `assets: []`，且不會被路徑 A 那個 og:image 安全網接住。

### 1.2 事後補圖第一層：站內 cron（`assignMissingNewsCardImages`，每 10 分鐘一次）

`lib/server/cron/registerJobs.ts:138-143`：站上的 Node process 本身每 10 分鐘跑一次 `assignMissingNewsCardImages(15)`（`lib/server/news/cardImages.ts`）。這一層**完全不管 og:image**，做的是「幫還沒有任何 `news_assets` 圖片的非政府來源文章,配一張 Pixabay → Pexels → Unsplash → Flickr 的關鍵字圖庫圖」，找不到候選圖或候選圖都用過就記一次 `image_backfill_attempts` 失敗、下次排到後面重試（不會放棄）。政府機關來源（`isGovSource`）被排除在外，改用 `ThematicCover`（見 1.4）。

### 1.3 事後補圖第二層：GHA 外部 og:image backfill（`news-og-backfill.yml`，一小時兩次）

見第 4 節詳細分析。重點是：`scripts/gha-og-external-backfill.mjs` 第 324-330 行、`lib/server/news/backfillOgImages.ts` 第 47-54 行（`MISSING_WHERE`）**都明確排除 `canonical_url LIKE '%news.google.com%'`**，`lib/server/images/fetchOpenGraphImage.ts` 第 70 行也是（`if (!canonicalUrl || /news\.google\.com/i.test(canonicalUrl)) return null;`）。三層 og:image 相關程式碼一致地放棄 Google News 網址——這不是疏漏,而是三個地方都留了註解說明原因（Google 的連結現在是 JS 轉址殼、不是真文章),但三份文件都只各自解釋自己為什麼跳過,沒有一份文件把「這代表這些來源永遠拿不到真圖」講清楚。詳見 2.1。

`listMissingCardImageTargets`（`backfillOgImages.ts:76-118`）另外還有 `image_backfill_attempts < 3` 的篩選條件——失敗滿 3 次的文章會被這個「外部 og:image 補圖」佇列永久放棄（但仍會被 1.2 的圖庫關鍵字配圖繼續嘗試,只是那條路本來就配不出真圖)。

### 1.4 顯示階段：列表卡片 vs. 文章詳情頁,用的是兩套不同、且不一致的邏輯

- **列表卡片**（`components/News/CardThumb.tsx` + `lib/server/news/queries.ts` 的 `CARD_IMAGE_SELECT_SQL`）：
  `card_image_url = COALESCE(news_assets 裡的第一張 image, news_card_images.local_path)`。這段 SQL 不管路徑是 `/images/...`（本地)還是 `https://...`（外部),兩種都會被選出來顯示,`CardThumb` 元件也是直接把 `src` 丟給 `next/image`,**沒有 https-only 的過濾**。政府機關來源另外有「Decision 6」規則：`isGov && isStockPhoto(card_image_source)` 時,一律改用 `ThematicCover`（公文白皮書風格向量封面),**這是刻意設計,不是 bug**——但若混在整體「缺圖比例」裡沒說明,很容易被誤判成大量缺圖。
- **文章詳情頁 hero**（`lib/server/news/heroImage.ts` 的 `resolveHeroImage`）：
  ```ts
  const heroAsset = assets.find(
    (asset) => asset.asset_type === "image" && /^https?:\/\//i.test(asset.url),
  );
  ```
  這個 `/^https?:\/\//` 檢查是 2026-08-18（commit `0efd53a`)之前留下來的邏輯,當時所有 `news_assets` 圖片都還是**直接熱連結來源網站的絕對網址**。但 2026-07-26 commit `9f6f31a`「Re-host article images locally instead of hotlinking the source site」把 `downloadArticleImage()` 改成回傳**站內相對路徑**（`/images/news/articles/article-<hash>.jpg`),`heroImage.ts` 在那之後的三次修改（`c479879`、`0efd53a`、`4e9663c`)都沒有同步更新這個正規表示式。實際影響見 2.4——這是本報告在程式碼比對中發現、並在線上驗證成立的一個獨立小 bug。

### 1.5 完整流程圖

```
                              ┌─────────────────────────────┐
                              │   RSS_FEEDS (~30 feeds)      │
                              │   enrichItem()                │
                              │   detail-scrape → RSS lead-img │
                              │   → fetchOpenGraphImageAsset   │──┐
                              │   (跳過 news.google.com)       │  │
                              └─────────────────────────────┘  │
                                                                 │
                              ┌─────────────────────────────┐   │
                              │ 特殊來源 (~51 sourceName)      │   │
                              │ processSpecialSource()         │   │
                              │ 各自 fetchXxx.ts 自己決定圖片   │   │
                              │ ※ 無 og:image 安全網            │   │
                              └─────────────────────────────┘   │
                                          │                      │
                                          ▼                      ▼
                              ┌───────────────────────────────────┐
                              │           news_assets 表            │
                              │   (asset_type='image', url=本地路徑) │
                              └───────────────────────────────────┘
                                          │  (仍是 NULL 的文章)
                                          ▼
        ┌───────────────────────────────────────────────────────────────┐
        │ 事後補圖 L1：站內 cron，每 10 分鐘                                │
        │ assignMissingNewsCardImages()                                   │
        │ Pixabay → Pexels → Unsplash → Flickr 關鍵字配圖 (排除 gov)       │
        │ 找不到 → 試 static map（僅街廓/村里以上精度）                     │
        └───────────────────────────────────────────────────────────────┘
                                          │  (仍是 NULL 且非 google news)
                                          ▼
        ┌───────────────────────────────────────────────────────────────┐
        │ 事後補圖 L2：GHA news-og-backfill.yml，一小時兩次 (:07 :37)      │
        │ Runner 側爬 og:image + SSH loopback 寫回 (跳過 news.google.com,  │
        │ image_backfill_attempts>=3 也放棄)                              │
        └───────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
              ┌───────────────────────────────────────────────┐
              │ 顯示                                             │
              │ 列表卡片 CardThumb ← COALESCE(news_assets,        │
              │                      news_card_images)           │
              │   gov 來源 + 圖庫圖 → 強制換 ThematicCover(設計)  │
              │ 詳情頁 hero resolveHeroImage() ← 只認 http(s) 開頭 │
              │   的 asset.url，本地路徑一律被跳過 (見 2.4 bug)   │
              └───────────────────────────────────────────────┘
```

---

## 2. 抽樣結果與根因分類

### 分類 A：來源本身就無法取得真實 og:image ——「Google 新聞代理」型來源（結構性、非新問題）

**成因**：本站有 12 個 feed 的 `url` 直接指向 `news.google.com`（`lib/server/config/rss-feeds.ts`）：`gnews`/`gnews_topic`（`google_news`）、`nhi`、`csr_cw`、`csr_cw_social`、`esg_gvm`、`esg_businesstoday`、`ubrand_udn`、`commonhealth`、`ttvc`、`ibt`、`vghtpe_news`。這些網站要嘛沒有自己的 RSS、要嘛被 Cloudflare JS challenge 擋掉直接爬取（`commonhealth` 的註解明講「confirmed via curl — even robots.txt returns a "Just a moment..." challenge page」),只能退而求其次用 Google News 的 `site:` 搜尋當 RSS 來源。

Google News RSS 的 `<link>` 現在一律是 `https://news.google.com/rss/articles/...` 轉址殼(不是真文章網址),站方三處程式碼（`fetchOpenGraphImage.ts:70`、`backfillOgImages.ts:53`、`gha-og-external-backfill.mjs:326`)都選擇直接放棄這種網址的 og:image 抓取——這個決定合理（Google 的殼頁面沒有真的 og:image,硬抓只會抓到 Google 自己的 logo),**但代價是這 12 個 feed 名下的文章,從進站的第一刻起就注定拿不到真圖,只能靠圖庫關鍵字配圖(分類 A 的下位分類 D)或永遠沒圖**。

**線上驗證(`/news?source=csr_cw`,30 筆樣本)**：13/30 完全沒有圖(純文字卡),其餘靠 Pexels/Flickr/Pixabay 圖庫圖撐著,**0 筆是該篇文章自己的真實配圖**。例：
- 「5000株南庄橙重返棲地！從瀕危植物到肺炎專利」——無圖
- 「如何用 BS8001、ISO 59000 打造循環經濟標竿企業？」——無圖
- 「一張環保成績單，如何翻轉臺灣地方治理？」——無圖

**線上驗證(`/news?source=thenewslens`,樣本)**：抽樣 24 筆中,僅 4 筆有圖(且全部是 Pixabay/Pexels 圖庫圖),其餘 20 筆左右完全無圖。例：
- 「引進外籍技術人力的戰略轉型：台灣旅宿業如何打造「全球人才循環」？」——無圖
- 「HYROX選手失禁引爆公衛危機：從健身房賽事到六億歐元生意的狂飆與考驗」——無圖
- 「日劇《直到T恤乾了為止》：看見彼此的碎片卻拼不出全貌，親密關係中最寂寞的真相」——無圖

（註：關鍵評論網`thenewslens`本身不是走 Google News,而是自己的分類列表頁,歸類在分類 B,但它的 RSS fallback 一樣會遇到 Google News 型態的「完全沒有可用連結結構」問題,細節見分類 B。）

### 分類 B：「特殊來源」缺少 og:image 補圖安全網,疊加「抓列表頁縮圖而非文章真圖」的弱點

**成因**：見 1.1 路徑 B。以下 7 個來源(對應 11 個 feed code)使用同一種「從分類列表頁卡片抓 `<img src>`」寫法：`pchome`(×3)、`thenewslens`(×3,HTML 模式)、`yonglin`、`children`(events)、`sfaa`、`helloyishi`、`commonhealth_club`。這種寫法有兩個弱點且都被實測命中：

1. **列表頁用 lazy-load,`src` 是共用預設縮圖,不是文章真圖。**
   **線上驗證(`/news?page=40`,PChome－健康新聞,30 筆樣本中的一部分)**：以下三則完全不同主題的文章,圖片路徑一模一樣,都是 `article-10bc08be933f8f49fff1a7a1.jpg`：
   - 「澎湖一天2起男性浮屍 馬公警、海巡報請檢方相驗」
   - 「台灣指數公司推IR議合服務平台2.0 鎖定3大升級」
   - 「北市府籲攤商勿掛選舉旗幟 沈伯洋：可能考量安全」
   - 「空服員名牌不再秀全名 3大航空全同意、勞動部盼其他服務業跟進」
   - 「法蘭克福機場爆瘧疾病例 員工及附近居民8人感染3死」

   同一頁樣本中「PChome－生活休閒」分類的文章反而幾乎每篇都有各自不同的真實照片(`article-9aaf9c...`、`article-2e9d0d...`、`article-bfc209...` 等),顯示問題出在「健康新聞」這個特定分類的列表頁模板(該模板的縮圖多半靠 JS 才換成真圖),而不是 PChome 網站整體。這正好符合「`src` 抓到 lazy-load 佔位圖」的假設,且 `parsePchomeHtml`(`fetchExpandedSources.ts:898`)只讀 `.attr("src")`,沒有像 `fetchSfaaNews`(第 492 行)一樣多讀一次 `.attr("data-src")`。

2. **RSS fallback 完全不擷取圖片。** `parseTheNewsLensRss()`(`fetchExpandedSources.ts:704-773`,當 Cloudflare 擋下 HTML 列表頁抓取時的備援路徑)建構 `EnrichedRssItem` 時固定寫 `assets: []`(第 764 行),沒有任何圖片擷取邏輯——對照同檔案的 `parseTheNewsLensHtml()` 至少還會抓列表頁的 `<img>`。`fetchTheNewsLensHealth/Lifestyle/Elderly()` 的邏輯是「HTML 抓不到東西就默默 catch 掉、改用 RSS」(第 786-788 行註解:「HTML scraping failed or blocked by Cloudflare, fall back to official FeedBurner RSS」),前端完全看不出某篇文章是走了哪條路,只會看到「沒圖」。

### 分類 C：文章詳情頁 hero 圖被自己的 regex 濾掉(獨立小 bug,只影響政府機關來源的文章內頁)

**成因**：見 1.4。`resolveHeroImage()` 的 `/^https?:\/\//i.test(asset.url)` 判斷式是 2026-07-26 本地化圖片路徑改造(commit `9f6f31a`)之前的產物,改造後從未同步更新。**注意範圍**：非政府來源的文章詳情頁其實會直接 `redirect()` 到原始外部網址(`app/news/[id]/page.tsx:82-89`),根本不會渲染這個 hero,所以這個 bug **只影響政府機關來源(mohw/hpa/cdc/…)自己會渲染的內頁**,不影響絕大多數文章、也不影響列表卡片(`CARD_IMAGE_SELECT_SQL` 沒有這個過濾)。

**線上驗證**：
- 列表頁 `/news?group=gov` 上,「國民健康署攜手全聯 推「買菜動一動」把身體活動融入日常」(news id `1014118`)的卡片圖片**正確顯示**一張超市採買的真實照片(`article-8da7b6a828d3df185888bcb2.jpg`,即 `news_assets` 裡的本地路徑圖)。
- 但打開該篇文章的詳情頁 `https://health.j172.tw/news/1014118`,**完全沒有 hero 圖**——因為 `resolveHeroImage()` 檢查 `asset.url` 是否以 `http(s)://` 開頭時,`/images/news/articles/article-8da7b6a828d3df185888bcb2.jpg` 不符合,被跳過;接著檢查 `card_image_source === 'rss'`(真實 asset,非圖庫圖)也不在 `isStockPhotoProvider` 白名單內,兩個分支都落空,函式回傳 `null`。**結果是:同一張圖片,卡片上看得到、進到文章內頁反而消失**——這是本次調查中唯一一個「圖片抓到了,但顯示邏輯本身有 bug 導致顯示失敗」的案例,且可 100% 重現(不依賴任何時效性資料)。

### 分類 D：圖庫關鍵字配圖 —— 圖有了,但跟內容無關(「錯誤圖片」而非「缺圖」)

當分類 A/B 的文章最終還是靠 `assignMissingNewsCardImages` 的 Pixabay/Pexels/Unsplash/Flickr 關鍵字配圖時,配到的圖不保證跟主題相關。實測例子：
- 「蔣萬安之子交換學生爭議：陽光法案要的是「透明」，不是「護航」」(關鍵評論網)配到 `pixabay-1836380.jpg`——一張與政治/陽光法案主題無關的通用圖庫圖。
- 「東元攜手台大祭745萬總獎金！2026淨零科技國際賽」(CSR@天下)配到 `pixabay-927581.jpg`。

這類案例圖片機制本身「有在運作」,但因為關鍵字抽取(`imageSearchTerms.ts` 的 Jieba/字典/fallback term)對這些偏時事/政策類標題效果有限,配出來的圖跟文章沒有視覺關聯,使用者體驗上仍然是「這張圖不對」。這與分類 A/B(完全沒圖)是不同的問題,但都會被使用者籠統地感受成「沒抓到正確圖片」。

### 對照組:不是問題的部分(避免誤判)

- **首頁近期新聞(`/news` 第一頁,30 筆)**：29/30 為文章自己的真實圖片,僅 1 筆(關鍵評論網)是圖庫圖。這批以 LTN(自由時報,`skipDetailFetch:true` 但走路徑 A、有 og:image 安全網)、TVBS、健康醫療網、中央社為主,證明**路徑 A 的來源在有 og:image 安全網的情況下,抓圖成功率其實很高**,問題集中在分類 A/B 描述的特定來源群。
- **`udn_health`、`ettoday`、`mirrormedia_healthnews`、`health_gvm`、`istyle_lovesex`** 抽樣皆 90%+ 為真實圖片(各 30 筆樣本中僅 1-2 筆是圖庫圖),顯示這些「特殊來源」雖然也走路徑 B、沒有共用安全網,但各自的專屬爬蟲寫得夠好,不受影響。
- **`/news?group=gov` 大量文字卡(無圖)**:多數是刻意設計(`CardThumb.tsx` 的 Decision 6:政府機關 + 圖庫圖 → 強制換 `ThematicCover` 向量封面),不是抓圖失敗,不應計入「缺圖」統計。

---

## 3. 外部研究：業界作法與 2-3 個具體建議

搜尋了 RSS 聚合器(NetNewsWire、WP RSS Aggregator、Feedzy)公開的圖片處理文件,以及 Google News RSS 轉址處理的既有實作,重點摘要:

- NetNewsWire 等聚合器的標準作法是「多層 fallback」:先看 feed 自帶的 enclosure/media:content,沒有就下載文章頁面找 `og:image`/`twitter:image`/`apple-touch-icon`,最後才落到固定的預設圖。本站路徑 A 其實已經是這個標準做法,缺口在路徑 B 沒有共用這套 fallback。
- 針對 lazy-load 圖片的爬蟲最佳實踐明確建議:同時檢查 `src` 與 `data-src`/`data-srcset`,因為現代網站幾乎都用 JS 在滾動時才把真實網址搬進 `src`,只讀 `src` 在伺服器端渲染(無 JS 執行)的爬蟲上會系統性抓到佔位圖——這正好對應分類 B 的觀察。
- Google News RSS 轉址是已知的公開問題,社群已有現成的解法模式(例如 `googlenewsdecoder` 這類套件、或對轉址網址發一次有限跳轉次數的 HTTP 請求解出真實文章網址),而不是像本站目前這樣直接放棄。

**建議 1:讓「特殊來源」的自訂爬蟲也走一次共用的 og:image fallback**
做法:在 `processSpecialSource()`(`runIngestion.ts:212`)裡,比照 `enrichItem()` 第 146-153 行,對 `assets` 為空的 item 補呼叫一次 `fetchOpenGraphImageAsset(item.canonicalUrl)`。
優點:改動集中在一處,一次修復所有「特殊來源」(不只 pchome/thenewslens),且完全複用既有、已驗證過的抓圖與落地邏輯,不需要新增任何外部依賴。
缺點:這 51 個特殊來源大多數 `canonicalUrl` 就是文章真實網址(能抓),但仍會對這些網站多發一次 HTTP request(等於路徑 A 的成本),需要評估對來源網站的禮貌性節流,以及是否會撞到與 GHA 外部補圖重疊做工。

**建議 2:爬蟲同時讀 `data-src`/`data-srcset`,並加一層「同一張圖被同分類多篇文章共用」的偵測**
做法:`fetchExpandedSources.ts` 裡 7 個用 `anchor.find("img").attr("src")` 的地方,比照 `fetchSfaaNews` 加上 `|| .attr("data-src")`;另外可以在 `assignMissingNewsCardImages`/`backfillOgImages` 寫入前,查一下同一 `source_name` 底下最近 N 篇是否已經用過同一個圖片 hash,若是則視同「沒抓到」,轉去跑 og:image fallback 而不是靜靜接受。
優點:成本低(改 1-2 行 + 一個查詢),直接命中已實測驗證的 PChome 案例。
缺點:「同圖多篇」的偵測是一種事後補救,治標不治本;真正的圖仍然要靠 `data-src` 或改用路徑 A 式的 og:image 抓取才能拿到。

**建議 3:對 Google News 代理型來源加一道「解析轉址、跳過再抓」的步驟,而不是直接放棄**
做法:對 `canonical_url` 命中 `news.google.com` 的 item,在寫入前先發一次有限跳轉次數(例如上限 3-5 跳)、短逾時的 HTTP HEAD/GET 請求解出真正的發布站網址,成功才把 `canonical_url` 換成解析後的網址,再照路徑 A 正常跑 og:image;解析失敗就維持現狀(仍然放棄,不倒退)。
優點:一次讓 12 個 feed(`csr_cw`、`esg_gvm`、`esg_businesstoday`、`ubrand_udn`、`commonhealth`、`ttvc`、`ibt`、`vghtpe_news`、`nhi` 等)有機會拿到真圖,而不是永遠依賴圖庫配圖;這些來源目前不只缺圖,連文章內文也因為 `skipDetailFetch:true` 只能用 RSS 摘要,解出真網址對內文品質也有附帶好處。
缺點:Google 的轉址頁面格式不受站方控制,可能隨時改版失效,且對這些網站等於多了一次額外的網路請求與延遲,需要獨立的錯誤處理與監控(不能讓解析失敗拖垮整個 ingestion run)。

---

## 4. 降低主機負擔角度

### 4.1 目前排程與呼叫量

- **站內 cron(每 10 分鐘)**:`assignMissingNewsCardImages(15)` 在 App 自己的 Node process 內執行,直接查 DB + 呼叫 Pixabay/Pexels/Unsplash/Flickr API,每次最多處理 15 篇文章。這一層本來就在應用程式進程內,不額外佔用 SSH connection,但每 10 分鐘一次、一天 144 次,對外部圖庫 API 有固定的呼叫量。
- **GHA `news-og-backfill.yml`(一小時兩次,`cron: "7,37 * * * *"`)**:
  - 透過 `scripts/lib/ssh-loopback.mjs` 的 SSH ControlMaster,**整個 job 只開一條 SSH connection、multiplex 所有呼叫**(這是 2026-08-21 那波 LVE 資源事故後已經修好的部分,見 `ops_health_502_watchdog.md`),不會像修復前那樣「每次 API 呼叫開一條新 SSH connection」。
  - 但每條 multiplex 出來的 session 仍然是遠端 host 上 fork 一個新的 `curl` process。單次 job 最多跑 `OG_BACKFILL_ROUNDS=12` 輪,每輪先 1 次 `listMissing`,再對最多 `OG_BACKFILL_LIMIT=20` 篇文章各發 1 次 `attachImageUrl`/`attachImageBytes`/`markFailed`——**理論上限是每次 job 執行到 12×(1+20) = 252 次遠端 curl fork**,但有「連續 3 輪沒有任何成功指派就提早結束」的機制(第 400-405 行),實際次數會隨著缺圖積壓量遞減,積壓清空後多半 1-2 輪就會提早跳出。
  - 圖片本體的下載(`fetchImageBytes`)發生在 GHA runner 上,不經過 shared host 的對外頻寬,只有「已經下載好的 base64 bytes」經 SSH 傳回 host 寫檔——這部分已經是相對省資源的設計,不需要再優化。

### 4.2 有沒有辦法降低頻率而不犧牲成功率

- **「一小時兩次全量重跑」與「新文章進站時觸發」並不互斥,可以疊加而非二選一。** 目前 `listMissingCardImageTargets` 是撈「全部缺圖且 `image_backfill_attempts<3`」的文章,不分新舊,所以即使晚一點才补图,新文章跟舊文章排在同一個 12 輪佇列裡搶名額——如果同時段有一波旧文章backlog,新文章的补图反而会被往后排。
- 具體可行的調整方向(不改變現有補圖邏輯,只調整觸發時機):
  1. 在 RSS ingestion 完成(`runRssIngestion` 結束)時,若本次有新文章且缺圖,**直接觸發一次小規模(例如 limit=10)的 GHA workflow_dispatch**,取代固定 cron 排程去追新文章;固定 cron 頻率則可以降到「一天 2-4 次」,專門處理歷史 backlog 與重試失敗項目,而不必每 30 分鐘全量掃。
  2. 也可以簡單地把 `listMissingCardImageTargets` 的排序改成「新文章优先、backlog 其次」(目前已經是 `ORDER BY image_backfill_attempts ASC, published_at_utc DESC`,理論上新文章因為 attempts=0 已經優先,但如果 backlog 也都是 attempts=0,新舊仍會混在一起搶額度)——這個調整成本最低,且不需要改排程頻率本身。
  3. 若採用建議 1(讓特殊來源也走 `fetchOpenGraphImageAsset`),等於把一部分原本要靠 GHA 補圖的量提前在進站當下解決,GHA 這一層要處理的 backlog 量會自然下降,間接允許降低 cron 頻率。

以上三點都不需要犧牲成功率——重點是把「新文章」與「歷史 backlog 重試」两种不同急迫性的需求分開排隊,而不是用同一條頻率、同一個 limit 打包處理。

---

## 5. 小結:回應使用者回報的「大部分新聞卡片還是沒抓到正確圖片」

實測顯示**不是全站性、也不是單一根因**:

1. 高品質、有自己 RSS/detail-scrape 的主流來源(LTN、TVBS、健康醫療網、ETtoday、元氣網、鏡週刊等)抓圖成功率很高,不是問題主體。
2. 真正命中率低的是兩群結構性弱點明確的來源:
   - **12 個 Google News 代理來源**(csr_cw、esg_gvm、esg_businesstoday、ubrand_udn、commonhealth、ttvc、ibt、vghtpe、nhi、google_news 等)——canonical_url 是轉址殼,三層 og:image 邏輯都主動放棄,只能靠圖庫配圖或完全沒圖。
   - **PChome、關鍵評論網等 7 個用「列表頁縮圖 + 無安全網」寫法的特殊來源**——結構上就沒有 og:image 補救機制,PChome 健康新聞分類還額外命中「lazy-load 佔位圖被誤認為真圖」。
3. 另外發現一個獨立、可 100% 重現的小 bug:政府機關來源的文章**內頁** hero 圖因為過時的 `/^https?:\/\//` regex 被錯誤地過濾掉,即使該篇文章在列表卡片上有正確的真實圖片。這與使用者回報的「卡片」關聯較弱(卡片本身沒事),但屬於同一套抓圖/顯示 pipeline 的瑕疵,一併記錄。

以上排序建議做為後續開修復工單時的優先順序參考,細節請見第 2、3 節對應的程式碼位置與行號。
