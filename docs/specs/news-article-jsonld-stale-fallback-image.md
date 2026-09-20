# 新聞內頁結構化資料（NewsArticle）圖片欄位卡在通用預設圖，即使真實照片已存在

- **作者**：Claude（診斷會話）
- **日期**：2026-09-20
- **狀態**：Draft
- **對應**：使用者要求用 PageSpeed/Search Central/schema.org 優化網站的後續發現

## 1. 已確認的事實（不用重新調查這部分）

- `lib/server/news/seo.ts` 的 `resolveArticleImageUrl()`：
  ```ts
  toAbsoluteUrl(news.card_image_url ?? null, baseUrl) ??
    `${baseUrl}/images/og/source/${...}.png` // 通用來源預設圖
  ```
  這個 fallback 本身是刻意設計（docstring 有寫明：`card_image_url` 為 null 時退回通用圖），**不是 bug**。`toAbsoluteUrl()` 對相對路徑（`/images/news/articles/...`）的處理也正確（會補上 baseUrl），不是像 hero image 那個已修復的 regex 問題。
- 實測 news id `1014118`（國民健康署「買菜動一動」，2026-09-18 發布）：
  - 新聞列表卡片正確顯示真實照片 `article-8da7b6a828d3df185888bcb2.jpg`（`CARD_IMAGE_SELECT_SQL` 的 COALESCE 結果）。
  - 但 `/news/1014118` 頁面的 `<script type="application/ld+json">` 裡 `NewsArticle.image` 卻是 `https://health.j172.tw/images/og/source/hpa.png`（通用來源圖），代表這個頁面生成當下 `resolveArticleImageUrl()` 收到的 `card_image_url` 是 null。
  - `getNewsById()`（`lib/server/news/queries.ts`）與 list 查詢用的是同一份 `CARD_IMAGE_SELECT_SQL`（純量子查詢，不是 JOIN 導致的多列問題），SQL 邏輯本身在單筆查詢與列表查詢之間沒有差異，**不是 SQL 寫法的 bug**。

## 2. 最可能的根因（待驗證，不是已證實，需要實際查證）

`app/news/[id]/page.tsx` 設定 `export const revalidate = 300`（ISR，5分鐘），`next.config.js` 另外對 `/news/:path*` 設定 `Cache-Control: public, s-maxage=60, stale-while-revalidate=600`（Cloudflare edge cache）。Next.js 的 ISR 是「有人訪問且已過期才會在背景重新產生」，不是主動排程刷新。

推測時序：這篇文章剛進站時，圖片可能還沒被背景排程（`assignMissingNewsCardImages` 每10分鐘、`news-og-backfill.yml` 每小時兩次）補上，此時第一次有人訪問 `/news/1014118` 觸發 ISR 產生靜態頁面，那時 `card_image_url` 確實是 null，於是 metadata/JSON-LD 被烘進通用預設圖。之後圖片雖然補上了，但如果這篇文章流量低、很少人再次訪問觸發 revalidate，這個「烘進去的舊版 metadata」就會一直卡著，即使 DB 裡的資料早就正確。

**待辦：先驗證這個推測是否成立**（例如比對這篇文章的 `first_seen_at_utc`/`image_backfill_attempts` 时間戳記與其 ISR 是否真的長時間沒被重新觸發過），再決定用哪種修法。

## 3. 可能的修法方向（依驗證結果選擇，不要不驗證就直接套用）

- **選項 A**：圖片管線（`assignMissingNewsCardImages`、`backfillOgImages`/GHA 外部補圖）在成功幫某篇文章補上圖片後，主動呼叫 Next.js 的 `revalidatePath(`/news/${id}`)`（或等效的 on-demand revalidation API），讓該篇文章的 ISR 快取立即刷新，而不是被動等待下一次訪客觸發。這是治本的做法，往後任何「進站當下缺圖、之後才補上」的文章都不會再卡住。
- **選項 B**：縮短 `revalidate` 秒數（治標，只是縮小卡住的時間窗，不解決低流量文章可能永遠卡住的問題）。
- 兩者可以並存（選項A治本、選項B當作保底），但至少要做選項A。

## 4. 驗收標準

- 針對至少一篇「已知圖片是之後才補上」的既有文章，驗證觸發修復邏輯後，其 `/news/<id>` 頁面的 metadata `og:image` 與 `NewsArticle.image` 都能反映目前 DB 裡正確的 `card_image_url`，不需要等待自然流量觸發 ISR。
- 不要影響其他頁面（`/news` 列表頁、首頁等）既有的 ISR/快取行為。
- `npm test`／`npm run build` 通過，並為 revalidation 觸發邏輯補上至少一則測試（可用 mock 驗證补圖成功後有呼叫 revalidation，不需要真的跑一次完整的 Next.js ISR）。
