import type { FeedCode } from "@/types/rss";

/**
 * 「目前真的在跑」的 special source feed_code 清單（issue #738 診斷端點用，見
 * lib/server/ops/diagnostics.ts 的 news-feed-stats）。
 *
 * RSS_FEEDS（lib/server/config/rss-feeds.ts）是 XML/RSS 來源的單一事實來源，可以直接
 * `RSS_FEEDS.map(f => f.code)`。但 lib/server/rss/runIngestion.ts 裡還有一大段「非
 * RSS/XML」的 special source（JSON API、HTML 爬蟲），每個都是 `processSpecialSource(meta,
 * fetchFn, ctx)` 呼叫內嵌的字面量 `meta` 物件，或是 `npoSources`／`expandedPhase3Sources`
 * 兩個區域陣列裡的項目——目前沒有單一陣列可以直接 import（runIngestion.ts 本身 import 了
 * 資料庫／AI SEO／圖片下載等有副作用的模組，diagnostics.ts 刻意不 import 任何模組，兩邊
 * 碰不到一起），所以這份清單先用列舉方式維護。
 *
 * 不是永遠不會過時的自動清單，但不是沒人把關：
 * tests/active-feed-codes.test.mjs 會讀 runIngestion.ts 的原始碼，抓出每一個
 * `code: "..."` 字面量，跟下面這份清單做集合相等比對——runIngestion.ts 新增或移除一個
 * special source卻忘了同步這裡，測試就會紅，而不是靠人記得。
 *
 * 不要把 types/rss.ts 的 FeedCode 聯集當作「現行清單」：那個型別刻意把已退役的代碼
 * （包含 2026-10-20 issue #705 下架的 tase_news、commonhealth_club_new）留著，只是為了
 * news_items 裡的舊資料列還能有合法型別，跟「現在還有沒有在抓」是兩回事。
 */
export const SPECIAL_SOURCE_FEED_CODES: ReadonlyArray<FeedCode> = [
  // runIngestion.ts 裡逐一具名呼叫 processSpecialSource 的來源。
  "mirrormedia_healthnews",
  "udn_health",
  "moenv_mnews",
  "setn_health",
  "healthnews_tw",
  "fiftyplus_health",
  "businessweekly_health",
  "edh_health",
  "sfunhk_blog",
  "letsharu_article",
  "femh_research",
  "istyle_lovesex",
  "tvbs_health",
  "uho_health",
  "cgmh_news",
  "cgmh_press",
  "moda_press",
  "sungful_knowledge",
  "mamibuy_talk",
  "tasctaiwan_news",
  "antidrug_news",
  "police_7505_news",
  "ithome_healthit",
  // runIngestion.ts 的 `npoSources` 陣列。
  "amnesty_news",
  "npo_hotmsg",
  "down_syndrome_news",
  "worldvision_articles",
  "syinlu_news",
  "worldpeace",
  "greenpeace",
  "ccf_news",
  "eden_news",
  "elder_news",
  "savedogs_news",
  "igiving_news",
  "caresb_news",
  "nncf_news",
  "chilingjj_news",
  "anews_news",
  "apatw_news",
  "seinsights_news",
  "mygopen_news",
  "kuma_news",
  // runIngestion.ts 的 `expandedPhase3Sources` 陣列。
  "yonglin_news",
  "children_events",
  "children_research",
  "helloyishi_health",
  "thenewslens_health",
  "thenewslens_lifestyle",
  "thenewslens_elderly",
  "shih_hsin",
];
