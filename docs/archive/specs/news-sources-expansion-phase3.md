# 19 大新聞與公益來源入庫擴充規格 (Phase 3)

## 1. 概述 (Overview)
本規格實作使用者指定之 19 大新聞來源（涵蓋兒少福利、健康醫療、熟齡銀髮、寵物關懷、藝文教育等）：
遵循使用者核心準則：
1. **「所有來源都是先入 DB 再從 DB 讀取」**：
   - 抓取器爬取標準化後寫入 `news_items`（與既有 news 系統完全整合），提供全站 `/news` 與分類頁面檢索。
2. **全文入庫 vs 商業媒體摘要跳轉 (`skipDetailFetch: true`)**：
   - **官方／NPO 公益來源**（永齡、兒福聯盟、教育部家庭教育網、衛福部社家署、國家圖書館等）：
     完整抓取正文內頁（`detailHtml` / `summary`），由本站內頁完整閱讀。
   - **商業媒體來源**（Hello醫師、潮健康/眾心益友、草根影響力、康健大人社團、關鍵評論網、PChome、ETtoday）：
     配置 `skipDetailFetch: true`，僅爬取標題、官方摘要、發布時間與縮圖入庫，使用者點擊內頁「閱讀全文」直接跳轉至原站來源，尊重商業媒體著作權。

---

## 2. 19 大來源配置表 (Sources Taxonomy)

| # | 來源名稱 | FeedCode | 來源類別 (`sourceCategories`) | 抓取方式 | 模式 (`skipDetailFetch`) | 原始 URL / RSS |
|---|---|---|---|---|---|---|
| 1 | 永齡基金會 | `yonglin_news` | `npo` (公益社福) | HTML Listing | 全文入庫 (`false`) | `https://www.yonglin.org.tw/news/list` |
| 2 | 兒福聯盟－活動消息 | `children_events` | `npo` (公益社福) | HTML Listing | 全文入庫 (`false`) | `https://www.children.org.tw/news/index?cat=活動消息` |
| 3 | 兒福聯盟－調查研究 | `children_research` | `npo` (公益社福) | HTML Listing | 全文入庫 (`false`) | `https://www.children.org.tw/publication_research/treasure_chest` |
| 4 | 教育部家庭教育網 | `moe_familyedu` | `official` (官方政令) | HTML Listing | 全文入庫 (`false`) | `https://familyedu.moe.gov.tw/docList.aspx?uid=28&pid=27` |
| 5 | Hello醫師 | `helloyishi_health` | `media` (健康醫療) | HTML / Feed | 摘要跳轉 (`true`) | `https://helloyishi.com.tw/health/` |
| 6 | 潮健康 (WeGetCare) | `wegetcare_blog` | `media` (健康醫療) | XML Feed | 摘要跳轉 (`true`) | `https://www.wegetcare.tw/blog-feed.xml` |
| 7 | 草根影響力－生活 | `grinews_life` | `media` (生活新知) | RSS 2.0 | 摘要跳轉 (`true`) | `https://grinews.com/news/category/life/feed/` |
| 8 | 草根影響力－健康 | `grinews_health` | `media` (健康醫療) | RSS 2.0 | 摘要跳轉 (`true`) | `https://grinews.com/news/category/health/feed/` |
| 9 | 康健大人社團 | `commonhealth_club_new` | `elderly` (熟齡銀髮) | HTML / Feed | 摘要跳轉 (`true`) | `https://club.commonhealth.com.tw/new` |
| 10 | 關鍵評論網－健康 | `thenewslens_health` | `media` (健康醫療) | HTML / Feed | 摘要跳轉 (`true`) | `https://www.thenewslens.com/category/health` |
| 11 | 關鍵評論網－生活 | `thenewslens_lifestyle` | `media` (生活新知) | HTML / Feed | 摘要跳轉 (`true`) | `https://www.thenewslens.com/category/lifestyle` |
| 12 | 關鍵評論網－銀髮 | `thenewslens_elderly` | `elderly` (熟齡銀髮) | HTML / Feed | 摘要跳轉 (`true`) | `https://www.thenewslens.com/category/elderly` |
| 13 | 衛福部社家署－最新消息 | `sfaa_news` | `official` (官方政令) | HTML Listing | 全文入庫 (`false`) | `https://www.sfaa.gov.tw/sfaa/list/5cX` |
| 14 | PChome－健康新聞 | `pchome_health` | `media` (健康醫療) | HTML Listing | 摘要跳轉 (`true`) | `https://news.pchome.com.tw/cat/healthcare` |
| 15 | PChome－熱門寵物 | `pchome_pet` | `pet` (寵物生活) | HTML Listing | 摘要跳轉 (`true`) | `https://news.pchome.com.tw/cat/pet/hot` |
| 16 | PChome－生活休閒 | `pchome_living` | `media` (生活新知) | HTML Listing | 摘要跳轉 (`true`) | `https://news.pchome.com.tw/cat/living` |
| 17 | ETtoday 寵物雲 | `ettoday_pet` | `pet` (寵物生活) | RSS 2.0 | 摘要跳轉 (`true`) | `https://feeds.feedburner.com/ettoday/pet` |
| 18 | ETtoday 健康雲 | `ettoday_health` | `media` (健康醫療) | RSS 2.0 | 摘要跳轉 (`true`) | `https://feeds.feedburner.com/ettoday/health` |
| 19 | 國家圖書館－藝文活動 | `ncl_fmevents` | `official` (官方政令) | RSS 2.0 | 全文入庫 (`false`) | `https://web.ncl.edu.tw/event/FMEvents/Rss` |

---

## 3. 架構與實作細節 (Architecture & Implementation)

### 3.1 RSS 來源配置 (`lib/server/config/rss-feeds.ts`)
直接註冊 6 個具備原生標準 RSS/Atom 的來源：
- `wegetcare_blog`: `skipDetailFetch: true`
- `grinews_life`: `skipDetailFetch: true`
- `grinews_health`: `skipDetailFetch: true`
- `ettoday_pet`: `skipDetailFetch: true`
- `ettoday_health`: `skipDetailFetch: true`
- `ncl_fmevents`: `skipDetailFetch: false`

### 3.2 特殊爬蟲實作 (`lib/server/rss/fetchExpandedSources.ts`)
針對其餘 13 個 HTML Listing 網頁，實作輕量、穩健的 Cheerio / Regex 解析器：
- 永齡基金會 (`yonglin_news`): 抓取新聞列表與正文
- 兒福聯盟 (`children_events`, `children_research`): 抓取活動與報告摘要及正文
- 教育部家庭教育網 (`moe_familyedu`): 抓取最新公告
- 衛福部社家署 (`sfaa_news`): 抓取新聞標題與內容
- PChome 新聞 (`pchome_health`, `pchome_pet`, `pchome_living`): 抓取最新即時新聞清單與摘要跳轉
- 關鍵評論網 (`thenewslens_health`, `thenewslens_lifestyle`, `thenewslens_elderly`): 抓取文章卡片摘要
- Hello醫師 (`helloyishi_health`) & 康健大人社團 (`commonhealth_club_new`): 抓取最新文章摘要

### 3.3 型別與標籤對應
- `types/rss.ts`: 擴充 `FeedCode` 聯集型別。
- `lib/server/news/sourceLabels.ts`: 定義這 19 個來源之正體中文名稱。
- `lib/server/news/sourceCategories.ts`: 正確分配至 `official`, `npo`, `media`, `elderly`, `pet` 等分類。

### 3.4 驗收與測試
- 新增單元測試 `lib/server/rss/fetchExpandedSources.test.mjs`，驗證各來源配置與解析器。
- 執行 `npm test` 與 `npm run build`。
