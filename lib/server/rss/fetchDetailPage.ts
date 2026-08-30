import { load } from "cheerio";
import type { NewsAsset, NormalizedRssItem } from "@/types/rss";
import { httpGetText } from "@/lib/server/net/httpClient";
import { downloadArticleImage } from "@/lib/server/images/downloadArticleImage";

const toAbsoluteUrl = (url: string, base: string): string => {
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
};

// ---------------------------------------------------------------------------
// Per-source scoping for the TEXT projection (issue #71).
//
// The generic <article>/<main>/#maincontent scoping below plus the document-wide
// header/nav/footer strip is enough for a page whose article really is the whole
// of its content container. It is not enough for a dashboard, where the toolbar,
// the legend, the tab strip and the location picker all live *inside* <main>, so
// .text() concatenates them into detail_text as if they were prose.
//
// That matters beyond looking untidy: detail_text is the input to geo_summary,
// to the landmark extractor (lib/server/news/geoExtractor.ts), to
// lib/server/news/imageSearchTerms.ts and to reading-time estimates.
//
// Deliberately a hand-maintained per-offender table rather than a generic
// heuristic ("drop interactive-element runs with no sentence punctuation"):
// Chinese article prose is full of links and does not reliably carry the
// punctuation such a rule would key on, so the heuristic silently eats real
// sentences. This is the same shape, and the same rationale, as
// CHROME_IMAGE_PATTERNS in lib/server/news/cleanupChromeAssets.ts — every entry
// records the symptom that motivated it and the date it was observed, because a
// bare selector list rots the first time a publisher redesigns.
//
// Modes:
//   skip    — do not scrape a detail page for this host at all. Returns
//             detailHtml: null, detailText: null, assets: []; the feed's own
//             description stands as the article body. Only for hosts whose
//             detail page contributes nothing but chrome.
//   only    — allow-list: project the text from this container and nothing else.
//   without — deny-list: project the text from the usual container minus these.
//
// `only` and `without` affect detailText ONLY. detailHtml and the image/
// attachment asset scan keep seeing the unmodified container, exactly as the
// SVG <desc> strip from #65 does, so the rendered article keeps its map and its
// images. `skip` is the one mode that also gives up detailHtml and the assets.
//
// A host that is not listed here keeps today's behaviour, unchanged.
// ---------------------------------------------------------------------------
export type DetailTextScoping =
  | { mode: "skip" }
  | { mode: "only"; selector: string }
  | { mode: "without"; selector: string };

const DETAIL_TEXT_SCOPING: Record<string, DetailTextScoping> = {
  // 2026-08-29 — CWA's warning pages (/V8/C/P/Warning/W*.html) are live
  // dashboards, not articles. Their <main> yields 1230 chars for W29 高溫資訊 and
  // 845 for W26 豪雨特報, of which zero is the bulletin: it is a colour legend, a
  // 22-county warning table, a temperature-map media player and a location
  // picker. The picker's own label 「鄉鎮預報 - 臺北市中正區」 is prose-shaped and
  // names exactly one district, so #65's uniqueness rule accepted it and badged
  // two 高溫資訊 articles (/news/863122, /news/861342) 📍 台北市中正區; W26's county
  // table lists all 22 counties. `without` cannot help here — there is no
  // article on the page to keep. Verified by fetching both pages: the bulletin
  // prose (「西南風影響…」, 「天氣高溫炎熱…」) appears NOWHERE in their HTML; it is
  // carried only by the feed's <description>, which normalizeItem already stores
  // as description_text and app/news/[id] already falls back to for the body.
  // The card thumbnail is unaffected: runIngestion's fetchOpenGraphImageAsset
  // fallback still picks up og:image (…/Data/warning/W29_C.png).
  "cwa.gov.tw": { mode: "skip" },

  // 2026-08-29 — twstreetcorner.org (WordPress) opens every <article> with a
  // text-to-speech control panel inside .entry-content, and closes it with
  // Jetpack's sharing and related-posts widgets. All three are interactive
  // chrome that .text() flattened into detail_text: 「聆聽本文 測試版 ⏮ 上一段 ▶ 朗讀
  // ⏸ 暫停 ⏭ 下一段 ■ 停止 速度 0.8× 1× …」 and 「分享 分享到 Facebook(在新視窗中開啟) …
  // 請按讚：喜歡 正在載入... 相關」. ~250 of ~5200 chars, at the two positions that
  // matter most — the head of the text feeds imageSearchTerms and the SEO
  // summary. `without`, not `skip`: the rest of the container is genuine
  // long-form prose and must keep being scraped.
  "twstreetcorner.org": {
    mode: "without",
    selector:
      "div.streetcorner-tts-player, div.sharedaddy, div.jp-relatedposts",
  },

  // 2026-08-30 (#89) — hpa.gov.tw's Detail.aspx has no <article>/<main>/
  // #maincontent at all, so the projection falls back to <body> and takes the
  // whole page. 1771 chars for /Pages/Detail.aspx?nodeid=5020&pid=20299, of
  // which the bulletin is 1125: the rest is div#contentLeft (a 25-entry year
  // menu, 「新聞 115年 114年 … 91年」), div.contentTop (breadcrumb + share buttons +
  // 「點閱次數：351 更新日期：2026/08/27」), div.listWrap (a 「您可能會喜歡」 rail
  // listing five OTHER articles by headline and date) and div.surveyItem (a
  // 「看完本篇主題後，您的感覺如何？」 poll). The rail is the dangerous one: it puts
  // five unrelated headlines into the text the landmark extractor and
  // imageSearchTerms read, which is the #65 failure mode with a different
  // source. `only`, not `without`: the page's one prose block is cleanly
  // named, so allow-listing it is both shorter and robust to hpa adding a
  // sixth widget. Verified across all five hpa feeds (nodeid 124/126/127/128/
  // 129) — every article page carries exactly one div.contentBlock.
  "hpa.gov.tw": { mode: "only", selector: "div.contentBlock" },

  // 2026-08-30 (#89) — cdc.gov.tw/Bulletin/Detail likewise has no
  // <article>/<main>/#maincontent, so <body> is taken whole: 1620 chars for
  // the 8/27 登革熱 release, of which 742 — nearly half — is the site footer.
  // It survives the document-wide header/nav/footer strip because it is a
  // <div id="footer">, not a <footer>, and it is a full sitemap: 「網站導覽 關於
  // CDC 署長簡介 … 傳染病介紹 … 預防接種 流感新冠肺鏈疫苗…」, i.e. the name of every
  // disease and every section CDC publishes, appended to every single press
  // release. div.news-v3-in is the article card itself; allow-listing its
  // headline and its body keeps the whole release and drops the footer plus the
  // 「首頁 新聞稿」 breadcrumb, while `> div:not(.social-all)` also excludes the
  // 「取得短網址 回上一頁 取得短網址 關閉 複製」 share modal that sits beside the release
  // inside that same card. 1620 → 847 chars, with the release intact (the feed
  // description's shingles still score 100%). Verified on both cdc feeds that
  // resolve to a Bulletin/Detail URL (新聞稿 typeId=9 and 疫情訊息), three items
  // each.
  "cdc.gov.tw": {
    mode: "only",
    selector:
      "div.news-v3-in > h2.con-title, div.news-v3-in > div:not(.social-all)",
  },

  // 2026-08-30 (#89) — fda.gov.tw/tc/newsContent.aspx, same <body> fallback.
  // The announcements themselves are short (the 8/26 河豚毒素 notice is 94
  // chars of 主旨/依據/公告事項), so the chrome dominates: of 450 chars, 108 are
  // div#contentLeft's section menu, 25 the 「目前位置：首頁 > 公告資訊 > 本署公告」
  // breadcrumb, 72 the div.score rating form — 「資訊內容對您是否有幫助 … 驗證碼：
  // 寄發驗證碼至信箱：(每次寄發驗證碼需間隔60秒) 送出評分」, 8 the a#gotocenter
  // 「跳到主要內容區塊」 skip link and 4 the 回上頁 button.
  // `without` rather than `only`: unlike hpa and cdc, the content here is
  // spread over several sibling panels (h3.dataTitle, div.edit, div.moreFile's
  // attachment list) with no single wrapper, so naming the five chrome blocks
  // is the accurate description. 450 → 237 chars. The 檔案下載 list is kept — those
  // links are the announcement's actual payload and already become attachment
  // assets.
  "fda.gov.tw": {
    mode: "without",
    selector: "a#gotocenter, div#contentLeft, div.path, div.score, a.backBtn",
  },

  // 2026-08-30 (#89) — mamaclub.com (WordPress/Divi) closes every <article>
  // with div#extra_article_content: an author box, a 「我要回應 我要留言 X點此登入
  // 來回應」 comment prompt, and a section#similar-post 「推薦閱讀」 rail carrying
  // SIX other articles as nested <article> teasers, headline plus a truncated
  // first paragraph each. That is ~700 of ~2100–3600 chars, and it is other
  // articles' prose — 「家扶籲關注能源平權 跨國共議弱勢家庭生活用能保障 … 面對全球能源
  // 轉型與…」 — landing in this article's detail_text. div.meta-author (「發表於
  // 2026-08-27 看留言討論」) and span.wpfp-span (「收藏文章」, WP Favorite Posts)
  // are the matching head-of-text chrome. Verified against all 10 items in
  // https://mamaclub.com/feed/ on 2026-08-30: every one shrinks (2168→1407,
  // 3598→2876, 4081→3383, …), every one ends on genuine article prose, and
  // detailHtml and the image/link asset lists are byte-identical in all ten.
  //
  // NB: #89 opened reporting mamaclub as projecting 0 characters. It does not,
  // through the code path that matters. Fetched with the repo's own
  // httpGetText (node:http) every article returns 200 and a full body; fetched
  // with global fetch()/undici the same URLs return 403 with
  // `cf-mitigated: challenge`. Whatever produced the original reading, it was
  // not this client — which is the argument for measuring through
  // extractDetailContent rather than through a convenience fetch.
  "mamaclub.com": {
    mode: "without",
    selector: "div.meta-author, span.wpfp-span, div#extra_article_content",
  },

  // 2026-08-30 (#89) — ilady.life (WordPress/PenciDesign) closes its <article>
  // with div.post-pagination (previous/next post) and div.post-related, a
  // 「Related Posts」 carousel of six other headlines — 「夏日亮白你挑對了嗎？…」,
  // 「磷蝦油比魚油好嗎？…」 — which is ~200 of ~1000 chars and, again, other
  // articles. It also OPENS with
  // <i class="penci-post-countview-number-check" style="display:none">3</i>,
  // a hidden view counter. Hidden to a browser is not hidden to .text(): that
  // bare digit was literally the first character of every ilady detail_text,
  // ahead of the first sentence — the part imageSearchTerms and the SEO summary
  // weight most. Verified on four items from https://ilady.life/feed/
  // (1013→771, 1017→763, 1253→969, 1372→1074), detailHtml and the asset lists
  // identical in all four.
  "ilady.life": {
    mode: "without",
    selector:
      "i.penci-post-countview-number-check, div.post-pagination, div.post-related",
  },

  // 2026-08-30 (#89) — lianhonghong.com (臉紅紅, 吾思傳媒) wraps the post in an
  // <article> whose prose is section.article-body and whose other four sections
  // are all furniture: section.article-header (title, 「by 讀者創作 2024/07/12
  // 1.9K 1」 — author, date, view count, comment count), aside.article-actions
  // (「收藏文章」), div.related-articles-structure (an in-body 「你可能想知道更多：」
  // link list) and section.article-meta, which carries the 執行編輯／核稿編輯
  // credits, the 吾思傳媒股份有限公司 disclaimer, the author bio, a five-headline
  // 「現代愛情，多元樣態」 rail — and unrendered Mustache template source,
  // 「{{#items.0}} {{/items.0}} {{^items}} {{/items}}」, which the client-side
  // renderer never filled in and .text() copies out verbatim. 350–490 of
  // 1800–3900 chars. Verified on four items from
  // https://feeds.feedburner.com/lianhonghong (1778→1431, 3855→3368,
  // 1380→826, 1937→1465), detailHtml and the asset lists identical in all four.
  "lianhonghong.com": {
    mode: "without",
    selector:
      "section.article-header, section.article-meta, aside.article-actions, div.related-articles-structure",
  },
};

/**
 * Looks up the scoping rule for a canonical URL's host. Matches the host itself
 * or any subdomain of it, so one `cwa.gov.tw` entry covers `www.cwa.gov.tw`.
 * Returns null — i.e. today's unmodified behaviour — for an unlisted host.
 */
export const resolveDetailTextScoping = (
  canonicalUrl: string,
): DetailTextScoping | null => {
  let host: string;
  try {
    host = new URL(canonicalUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [configuredHost, scoping] of Object.entries(DETAIL_TEXT_SCOPING)) {
    if (host === configuredHost || host.endsWith(`.${configuredHost}`)) {
      return scoping;
    }
  }
  return null;
};

const uniqueAssets = (assets: NewsAsset[]): NewsAsset[] => {
  const seen = new Set<string>();
  const result: NewsAsset[] = [];

  for (const asset of assets) {
    const key = `${asset.assetType}:${asset.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }

  return result;
};

const pickOpenGraphImageUrl = (
  $: ReturnType<typeof load>,
  baseUrl: string,
): string | null => {
  const rawCandidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[property="og:image:secure_url"]').attr("content"),
    $('meta[property="og:image:url"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('meta[name="twitter:image:src"]').attr("content"),
  ];
  for (const raw of rawCandidates) {
    if (!raw?.trim()) continue;
    const absolute = toAbsoluteUrl(raw.trim(), baseUrl);
    if (!/^https?:\/\//i.test(absolute)) continue;
    if (
      /logo|favicon|icon|sprite|placeholder|\/aa\.(png|gif)|\/x\.png/i.test(
        absolute,
      )
    )
      continue;
    return absolute;
  }
  return null;
};

/**
 * The pure DOM half of {@link fetchDetailPage}: everything from a loaded
 * document to `detailHtml` / `detailText` and the container the asset scan
 * walks. Exported with no network and no I/O of its own so the fixture test
 * (`fetchDetailPage.test.mjs`) can exercise the real projection — including the
 * per-source scoping table — against saved HTML.
 *
 * `$` must be loaded but NOT yet stripped: the caller reads <meta> for og:image
 * first, and this function removes <head>/<meta> on the way through.
 *
 * `scoping` defaults to whatever DETAIL_TEXT_SCOPING says about `canonicalUrl`;
 * it is a parameter so the test can drive a mode no configured host uses yet.
 */
export const extractDetailContent = (
  $: ReturnType<typeof load>,
  canonicalUrl: string,
  scoping: DetailTextScoping | null = resolveDetailTextScoping(canonicalUrl),
): {
  scopedContainer: ReturnType<ReturnType<typeof load>> | null;
  detailContainer: ReturnType<ReturnType<typeof load>>;
  detailHtml: string | null;
  detailText: string | null;
} => {
  $("script,style,noscript,iframe").remove();
  // Removed before container selection so a body-level fallback (sites with no
  // <article>/<main>/#maincontent, e.g. cdc.gov.tw) doesn't pull in site-chrome
  // images like the header logo as if they were part of the article.
  $("header,nav,footer").remove();
  // Some sources (e.g. ltn.com.tw) have a stray <base>/<title> literally inside
  // <body>. Rendered later via dangerouslySetInnerHTML, the browser hoists
  // <title> into our page's real <head> (clobbering our own title) and a
  // <base> tag silently rewrites every relative URL on the whole page.
  $("title,base,head,meta").remove();

  const scopedContainer =
    $("article").first().length > 0
      ? $("article").first()
      : $("main").first().length > 0
        ? $("main").first()
        : $("#maincontent").first().length > 0
          ? $("#maincontent").first()
          : null;
  const detailContainer = scopedContainer ?? $("body");

  const detailHtml = detailContainer.html()?.trim() || null;

  // cheerio's .text() concatenates EVERY descendant text node, including markup
  // whose text is metadata rather than prose. CWA 特報 bulletins embed an inline
  // SVG map of Taiwan in which each township is a <path> carrying a <desc> with
  // its name, so detail_text ended up containing all 368 township names — which
  // made the landmark extractor badge a 臺南/屏東 rainfall warning 台北市中正區
  // (issue #65). <script>/<style> are already gone document-wide above, but they
  // are listed here too so this stays correct if that earlier strip ever moves.
  //
  // Done on a CLONE: detailHtml is captured above from the live container, and
  // the asset scan below still walks scopedContainer, so the rendered article
  // keeps its map and its images. Only the text projection loses the metadata.
  const proseContainer = detailContainer.clone();
  proseContainer.find("desc,title,script,style").remove();

  // Per-source chrome scoping (#71) — same clone, same reason: text only.
  if (scoping?.mode === "without") {
    proseContainer.find(scoping.selector).remove();
  }
  const proseRoot =
    scoping?.mode === "only" && proseContainer.find(scoping.selector).length > 0
      ? // .text() over a multi-element selection concatenates every match, which
        // is what an allow-list of one-or-more prose blocks wants.
        proseContainer.find(scoping.selector)
      : // Including the case where an `only` selector matched nothing, e.g. the
        // publisher redesigned. Degrading to today's whole-container behaviour
        // keeps some chrome; degrading to null would throw the article away.
        proseContainer;

  const detailText = proseRoot.text().replace(/\s+/g, " ").trim() || null;

  return { scopedContainer, detailContainer, detailHtml, detailText };
};

export const fetchDetailPage = async (
  item: NormalizedRssItem,
): Promise<{
  detailHtml: string | null;
  detailText: string | null;
  assets: NewsAsset[];
}> => {
  // `skip` hosts short-circuit before the request: there is nothing on the page
  // worth the round trip. Everything this returns is null/empty — no
  // detail_html, no detail_text, no attachment assets — and the feed's own
  // description carries the article. runIngestion's fetchOpenGraphImageAsset
  // fallback still runs, so the card thumbnail is unaffected.
  if (resolveDetailTextScoping(item.canonicalUrl)?.mode === "skip") {
    return { detailHtml: null, detailText: null, assets: [] };
  }

  const response = await httpGetText(item.canonicalUrl, {
    headers: {
      "User-Agent": "health.j172.tw-rss-ingestor/1.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    timeoutMs: 15_000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Detail page HTTP ${response.status} for ${item.canonicalUrl}`,
    );
  }

  const html = response.text;
  const $ = load(html);

  // Capture social card image before stripping <head>/<meta> (ltn etc. often
  // lack a clean article image container but always ship a reliable og:image).
  const ogImageUrl = pickOpenGraphImageUrl($, item.canonicalUrl);
  const ogImageAlt =
    $('meta[property="og:image:alt"]').attr("content")?.trim() || null;

  const { scopedContainer, detailContainer, detailHtml, detailText } =
    extractDetailContent($, item.canonicalUrl);

  const assets: NewsAsset[] = [];
  let idx = 0;

  if (ogImageUrl) {
    const localPath = await downloadArticleImage(ogImageUrl);
    if (localPath) {
      idx += 1;
      assets.push({
        assetType: "image",
        title: ogImageAlt,
        url: localPath,
        sortOrder: 0,
      });
    }
  }

  detailContainer.find("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const absolute = toAbsoluteUrl(href, item.canonicalUrl);
    if (!/\/dl-|\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar)$/i.test(absolute))
      return;
    idx += 1;
    assets.push({
      assetType: "attachment",
      title: $(el).text().trim() || null,
      url: absolute,
      sortOrder: idx,
    });
  });

  // Only trust in-body <img> tags when we found a genuine content container. A
  // raw <body> fallback has no reliable way to distinguish article photos from
  // chrome icons — og:image above already covers the card thumbnail case.
  if (scopedContainer) {
    const imageElements = scopedContainer.find("img[src]").toArray();
    for (const el of imageElements) {
      const src = $(el).attr("src");
      if (!src) continue;
      if (/logo|favicon|icon/i.test(src)) continue;

      const absolute = toAbsoluteUrl(src, item.canonicalUrl);
      // Downloaded and re-hosted locally rather than storing the source
      // site's URL directly, so the front-end never hotlinks a third-party
      // domain (which can rate-limit, go offline, or move the file).
      const localPath = await downloadArticleImage(absolute);
      if (!localPath) continue;

      idx += 1;
      assets.push({
        assetType: "image",
        title: $(el).attr("alt")?.trim() || null,
        url: localPath,
        sortOrder: idx,
      });
    }
  }

  return {
    detailHtml,
    detailText,
    assets: uniqueAssets(assets),
  };
};
