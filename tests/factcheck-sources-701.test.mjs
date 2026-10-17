// Issue #701 — fact-checking sources (台灣事實查核中心 TFC + MyGoPen), the new
// 「事實查核／謠言」 source category and the 「查核機構，非本站判定」 card marker.
//
// No network: the two feeds are exercised through small real samples captured
// on 2026-10-16 (lib/server/rss/__fixtures__/{tfc,mygopen}-feed-sample.xml).
// TFC goes through the project's own RSS parser (parseFeedXml); MyGoPen goes
// through its existing special-source fetcher (fetchMygopenNews), with the HTTP
// client and the image downloader stubbed so the test can see what they were
// asked for.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);
const readRepoFile = (relativePath) => readFileSync(new URL(relativePath, REPO_ROOT), "utf8");

const FIXTURE_DIR = "lib/server/rss/__fixtures__/";
const tfcFeedXml = readRepoFile(`${FIXTURE_DIR}tfc-feed-sample.xml`);
const mygopenFeedXml = readRepoFile(`${FIXTURE_DIR}mygopen-feed-sample.xml`);

// Shared state the stub modules below read through globalThis.
const stubs = {
  httpUrls: [],
  downloadedImageUrls: [],
};
globalThis.__factcheck701 = stubs;

const STUB_HTTP_CLIENT =
  "data:text/javascript," +
  encodeURIComponent(
    `export const httpGetText = async (url) => { globalThis.__factcheck701.httpUrls.push(url); return { status: 200, text: globalThis.__factcheck701.mygopenFeedXml }; };`,
  );
const STUB_IMAGE_DOWNLOADER =
  "data:text/javascript," +
  encodeURIComponent(
    `export const downloadArticleImage = async (url) => { globalThis.__factcheck701.downloadedImageUrls.push(url); return "/images/news/articles/stub-" + globalThis.__factcheck701.downloadedImageUrls.length + ".png"; };`,
  );
stubs.mygopenFeedXml = mygopenFeedXml;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    if (specifier === "@/lib/server/net/httpClient") {
      return { url: STUB_HTTP_CLIENT, shortCircuit: true };
    }
    if (specifier === "@/lib/server/images/downloadArticleImage") {
      return { url: STUB_IMAGE_DOWNLOADER, shortCircuit: true };
    }
    if (specifier.startsWith("@/")) {
      const target = specifier.slice(2);
      for (const ext of [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"]) {
        const candidate = new URL(target + ext, REPO_ROOT);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      return nextResolve(new URL(target, REPO_ROOT).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { RSS_FEEDS } = await import("@/lib/server/config/rss-feeds");
const { getSourceLabel, hasSourceLabel, resolveAuthorLabel } = await import("@/lib/server/news/sourceLabels");
const {
  SOURCE_CATEGORIES,
  FACT_CHECK_CATEGORY_KEY,
  FACT_CHECK_NOTICE_SUFFIX,
  isFactCheckSource,
  isGovSource,
  getFactCheckNotice,
} = await import("@/lib/server/news/sourceCategories");
const { classifyNewsTopics, SOURCE_TOPIC_OVERRIDES } = await import("@/lib/server/news/classifyTopics");
const { parseFeedXml } = await import("@/lib/server/rss/parseRss");
const { fetchMygopenNews } = await import("@/lib/server/rss/fetchNpoSources");
const { getArticleDestination } = await import("@/lib/format/outboundLink");
const { decodeNonAsciiCharRefs, stripHtml, excerpt } = await import("@/lib/format/news");

const CJK = /[一-鿿]/;
const TFC_FEED = RSS_FEEDS.find((f) => f.code === "tfc_news");

// ---------------------------------------------------------------------------
// Config consistency: feed code <-> FeedCode literal <-> label <-> category
// ---------------------------------------------------------------------------

test("tfc_news is configured: URL, zh-Hant name, sourceName, no detail fetch", () => {
  assert.ok(TFC_FEED, "tfc_news must be registered in RSS_FEEDS");
  assert.equal(TFC_FEED.url, "https://tfc-taiwan.org.tw/feed/");
  assert.equal(TFC_FEED.name, "台灣事實查核中心");
  assert.equal(TFC_FEED.sourceName, "tfc");
  assert.equal(TFC_FEED.skipDetailFetch, true);
});

test("every fact-check feed code has a FeedCode literal in types/rss.ts", () => {
  const typesSource = readRepoFile("types/rss.ts");
  for (const code of ["tfc_news", "mygopen_news"]) {
    assert.ok(typesSource.includes(`| "${code}"`), `${code} must be a FeedCode literal`);
  }
});

test("every fact-check sourceName has a zh-Hant label and sits in the 查核 category", () => {
  const category = SOURCE_CATEGORIES.find((c) => c.key === FACT_CHECK_CATEGORY_KEY);
  assert.ok(category, "the factcheck category must exist");
  assert.equal(category.key, "factcheck");
  assert.equal(category.label, "事實查核／謠言");
  assert.deepEqual(
    category.sources.map((s) => s.sourceName),
    ["tfc", "mygopen"],
    "exactly the two owner-approved sources",
  );

  for (const { sourceName, label } of category.sources) {
    assert.equal(hasSourceLabel(sourceName), true, `${sourceName} needs a SOURCE_LABELS entry`);
    assert.equal(getSourceLabel(sourceName), label, `${sourceName}: category label and SOURCE_LABELS must agree`);
    assert.match(label, CJK, `${sourceName} label must be zh-Hant`);
    const owners = SOURCE_CATEGORIES.filter((c) => c.sources.some((s) => s.sourceName === sourceName));
    assert.deepEqual(
      owners.map((c) => c.key),
      [FACT_CHECK_CATEGORY_KEY],
      `${sourceName} must belong to the factcheck category and no other`,
    );
    assert.equal(isFactCheckSource(sourceName), true);
    assert.equal(isGovSource(sourceName), false, `${sourceName} is not an official source`);
  }
  assert.equal(getSourceLabel("tfc"), "台灣事實查核中心");
  assert.equal(getSourceLabel("mygopen"), "MyGoPen 查核中心");
});

test("TFC feed code, sourceName and category line up end to end", () => {
  assert.ok(TFC_FEED);
  assert.equal(hasSourceLabel(TFC_FEED.sourceName), true);
  assert.equal(isFactCheckSource(TFC_FEED.sourceName), true);
  assert.equal(
    resolveAuthorLabel({ dept_name: null, source_name: TFC_FEED.sourceName, feed_name: TFC_FEED.name }),
    "台灣事實查核中心",
  );
});

test("MyGoPen stays a single ingestion path: special source only, not also an RSS_FEEDS entry", () => {
  assert.equal(
    RSS_FEEDS.some((f) => f.code === "mygopen_news" || f.sourceName === "mygopen"),
    false,
    "a second RSS_FEEDS entry would ingest every article twice and store the full-text description",
  );
  assert.equal(typeof fetchMygopenNews, "function");
  const runIngestionSource = readRepoFile("lib/server/rss/runIngestion.ts");
  assert.ok(runIngestionSource.includes("fetchFn: fetchMygopenNews"), "fetchMygopenNews must stay wired into runIngestion");
});

test("MyGoPen moved out of 公益社福 into the fact-check category", () => {
  const npo = SOURCE_CATEGORIES.find((c) => c.key === "npo");
  assert.ok(npo);
  assert.equal(npo.sources.some((s) => s.sourceName === "mygopen"), false);
});

test("the 查核 category appears in every source filter built from SOURCE_CATEGORIES", () => {
  // /news?group=factcheck resolves to the two source names (app/(zh)/news/page.tsx)
  const group = SOURCE_CATEGORIES.find((c) => c.key === "factcheck");
  assert.deepEqual(group.sources.map((s) => s.sourceName), ["tfc", "mygopen"]);

  // The filter UIs all iterate SOURCE_CATEGORIES, so a new entry shows up in each.
  for (const file of [
    "components/News/GroupTabs.tsx",
    "components/News/NewsSidebar.tsx",
    "components/News/StabloNewsLayout.tsx",
    "app/(zh)/news/page.tsx",
    "app/sitemap.ts",
  ]) {
    assert.ok(readRepoFile(file).includes("SOURCE_CATEGORIES"), `${file} must be driven by SOURCE_CATEGORIES`);
  }
  assert.ok(readRepoFile("components/News/GroupTabs.tsx").includes("/news?group=${cat.key}"));
});

test("the OG placeholder script knows the new source's label", () => {
  const script = readRepoFile("scripts/generate-source-og-images.mjs");
  assert.ok(script.includes('tfc: "台灣事實查核中心"'));
});

test("rss-feeds.ts records the evaluated-and-excluded candidates (#701)", () => {
  const source = readRepoFile("lib/server/config/rss-feeds.ts");
  assert.ok(source.includes("Candidate verification 2026-10-16 (issue #701)"));
  for (const excluded of ["factchecklab.org", "rumtoast.com", "tstm.tw"]) {
    assert.ok(source.includes(excluded), `${excluded} must be documented as excluded`);
  }
  assert.ok(source.includes("2021-10-06"), "rumtoast's last update date");
  assert.ok(source.includes("2026-08-27"), "FactCheckLab's last update date");
});

// ---------------------------------------------------------------------------
// Real samples through the project's own parsers
// ---------------------------------------------------------------------------

test("TFC real sample parses through parseFeedXml", () => {
  assert.ok(TFC_FEED);
  const items = parseFeedXml(TFC_FEED, tfcFeedXml);
  assert.equal(items.length, 4);

  for (const item of items) {
    assert.equal(item.sourceName, "tfc");
    assert.equal(item.feedCode, "tfc_news");
    assert.equal(item.feedName, "台灣事實查核中心");
    assert.match(item.canonicalUrl, /^https:\/\/tfc-taiwan\.org\.tw\/[^/]+\/$/);
    assert.ok(item.title.length > 0);
    assert.ok(item.publishedAtUtc instanceof Date && !Number.isNaN(item.publishedAtUtc.getTime()));
    // The feed carries a short <description> excerpt only — nothing near full text.
    assert.ok(item.descriptionText.length < 400, `summary must stay an excerpt, got ${item.descriptionText.length} chars`);
    assert.equal(item.descriptionText.includes("&#x"), false, "descriptionText must be decoded");
    // No enclosure/media in the feed: the thumbnail comes from the existing og:image fallback.
    assert.equal(item.leadImageUrl ?? null, null);
  }

  const factCheck = items.find((i) => i.title.startsWith("【事實查核】"));
  assert.ok(factCheck, "the sample includes a real 【事實查核】 post");
  assert.equal(factCheck.categoryRaw, "國際合作");
  assert.equal(factCheck.canonicalUrl.startsWith("https://tfc-taiwan.org.tw/"), true);
});

test("TFC cards show readable excerpts: entity-encoded CJK decoded, WordPress footer dropped", () => {
  assert.ok(TFC_FEED);
  const items = parseFeedXml(TFC_FEED, tfcFeedXml);
  const award = items.find((i) => i.title.includes("卓越新聞獎"));
  assert.ok(award);
  // The stored HTML really is entity-encoded (this is what reached the cards before the fix).
  assert.ok(award.descriptionHtml.includes("&#x"), "fixture must exercise the entity path");

  for (const item of items) {
    const shown = excerpt(item.descriptionHtml, 95);
    assert.equal(shown.includes("&#"), false, `card excerpt must not show raw character references: ${shown}`);
    assert.equal(shown.includes("這篇文章最早發佈於"), false, "feed footer must not eat the excerpt");
  }
  assert.ok(excerpt(award.descriptionHtml, 95).startsWith("台灣事實查核教育基金會"));
});

test("MyGoPen real sample parses through the existing fetcher: summary only, Blogger image upscaled", async () => {
  stubs.httpUrls.length = 0;
  stubs.downloadedImageUrls.length = 0;
  const result = await fetchMygopenNews();

  assert.equal(result.ok, true);
  assert.equal(result.itemCount, 3);
  assert.equal(stubs.httpUrls.length, 1);
  assert.match(stubs.httpUrls[0], /^https:\/\/www\.mygopen\.com\/feeds\/posts\/default\?alt=rss/);

  for (const item of result.items) {
    assert.equal(item.sourceName, "mygopen");
    assert.equal(item.feedCode, "mygopen_news");
    assert.equal(item.feedName, "MyGoPen 查核中心");
    assert.match(item.canonicalUrl, /^https:\/\/www\.mygopen\.com\/\d{4}\/\d{2}\/[^/]+\.html$/);
    assert.match(item.externalId, /^mygopen_/);
    assert.ok(item.publishedAtUtc instanceof Date && !Number.isNaN(item.publishedAtUtc.getTime()));
    // 「你可以先知道」 summary only — the full article HTML (6-9 KB in the real feed) is never kept.
    assert.ok(item.descriptionText.startsWith("你可以先知道"), item.descriptionText.slice(0, 40));
    assert.ok(item.descriptionText.length < 700, `summary must stay short, got ${item.descriptionText.length} chars`);
    assert.equal(item.descriptionHtml, item.descriptionText, "no HTML body is stored");
    assert.equal(item.detailHtml, null);
    assert.equal(item.detailText, null);
    assert.equal(/<[a-z][^>]*>/i.test(item.descriptionHtml), false);
    // Image: through the existing downloadArticleImage flow, at full size not the 72px thumbnail.
    assert.equal(item.assets.length, 1);
    assert.equal(item.assets[0].assetType, "image");
    assert.match(item.assets[0].url, /^\/images\/news\/articles\/stub-\d+\.png$/);
  }
  assert.equal(stubs.downloadedImageUrls.length, 3);
  for (const url of stubs.downloadedImageUrls) {
    assert.match(url, /^https:\/\/blogger\.googleusercontent\.com\/img\//);
    assert.ok(url.includes("/s1600/"), `expected the /s1600/ rendition, got ${url}`);
    assert.equal(url.includes("/s72-c/"), false);
  }
});

// ---------------------------------------------------------------------------
// The marker
// ---------------------------------------------------------------------------

test("marker text: 「來源：XXX（查核機構，非本站判定）」 for both sources, nothing for others", () => {
  assert.equal(FACT_CHECK_NOTICE_SUFFIX, "（查核機構，非本站判定）");
  assert.equal(getFactCheckNotice("tfc", "台灣事實查核中心"), "來源：台灣事實查核中心（查核機構，非本站判定）");
  assert.equal(getFactCheckNotice("mygopen", "MyGoPen 查核中心"), "來源：MyGoPen 查核中心（查核機構，非本站判定）");
  for (const other of ["mohw", "cdc", "twreporter", "npo_tw", "ltn", "unknown_source", "", null, undefined]) {
    assert.equal(getFactCheckNotice(other, "任何來源"), null, `no marker for ${String(other)}`);
  }
});

test("marker uses the card's own resolved label", () => {
  const label = resolveAuthorLabel({ dept_name: null, source_name: "mygopen", feed_name: "MyGoPen 查核中心" });
  assert.equal(getFactCheckNotice("mygopen", label), "來源：MyGoPen 查核中心（查核機構，非本站判定）");
});

test("every card surface renders the marker component", () => {
  const notice = readRepoFile("components/News/FactCheckNotice.tsx");
  assert.ok(notice.includes("getFactCheckNotice"));
  assert.ok(notice.includes("if (!text) return null"), "renders nothing for other sources");

  const expectations = {
    "components/News/NewsCard.tsx": 2, // vertical + horizontal layout
    "components/News/HeroPost.tsx": 2, // hero + secondary cards
    "components/News/NewsSidebar.tsx": 1,
    "components/Search/SearchModal.tsx": 1,
  };
  for (const [file, minimum] of Object.entries(expectations)) {
    const source = readRepoFile(file);
    assert.ok(source.includes('import FactCheckNotice from "@/components/News/FactCheckNotice"'), `${file} imports the marker`);
    const uses = source.split("<FactCheckNotice").length - 1;
    assert.ok(uses >= minimum, `${file} must render <FactCheckNotice> at least ${minimum}x, found ${uses}`);
  }
});

test("fact-check cards link out to the publisher (not the site's own article page)", () => {
  const destination = getArticleDestination(
    { id: 1, source_name: "tfc", canonical_url: "https://tfc-taiwan.org.tw/top10_20261005_20261011/" },
    "news_card",
  );
  assert.equal(destination.isExternal, true);
  assert.ok(destination.href.startsWith("https://tfc-taiwan.org.tw/top10_20261005_20261011/?"));
  assert.ok(destination.href.includes("utm_source=health.j172.tw"));
});

// ---------------------------------------------------------------------------
// Topic classification keeps following the existing keyword rules
// ---------------------------------------------------------------------------

test("fact-check sources get no fixed topic override; keyword rules still classify them", async () => {
  assert.equal("tfc" in SOURCE_TOPIC_OVERRIDES, false);
  assert.equal("mygopen" in SOURCE_TOPIC_OVERRIDES, false);

  const { items } = await fetchMygopenNews();
  const classify = (needle) => {
    const item = items.find((i) => i.title.includes(needle));
    assert.ok(item, `fixture item containing ${needle}`);
    return classifyNewsTopics({ title: item.title, summary: item.descriptionText, sourceName: item.sourceName });
  };

  assert.ok(classify("釣魚網站詐騙").includes("anti-fraud"), "anti-fraud fact-check -> anti-fraud topic");
  const lawTopics = classify("少關人");
  assert.ok(lawTopics.includes("anti-fraud") && lawTopics.includes("anti-drug"));
  assert.deepEqual(classify("刷完牙"), [], "a plain health rumour carries no topic");

  assert.deepEqual(
    classifyNewsTopics({ title: "【錯誤】網傳「165專線」來電要求解除分期付款？實為詐騙集團話術", sourceName: "tfc" }),
    ["anti-fraud"],
  );
});

// ---------------------------------------------------------------------------
// Display helpers used by the cards
// ---------------------------------------------------------------------------

test("decodeNonAsciiCharRefs decodes CJK references and leaves everything else alone", () => {
  assert.equal(decodeNonAsciiCharRefs("&#x9752;&#x5E74;"), "青年");
  assert.equal(decodeNonAsciiCharRefs("&#38738;&#x5e74;"), "青年");
  assert.equal(decodeNonAsciiCharRefs("&#x3008;&#x3009;"), "〈〉");
  // ASCII references must never turn into markup.
  assert.equal(decodeNonAsciiCharRefs("&#60;script&#62; &#x41; &#38;"), "&#60;script&#62; &#x41; &#38;");
  // Out of range / surrogate / not a reference.
  assert.equal(decodeNonAsciiCharRefs("&#x110000; &#xD800; &#99999999999;"), "&#x110000; &#xD800; &#99999999999;");
  assert.equal(decodeNonAsciiCharRefs("plain & text &#; &#x;"), "plain & text &#; &#x;");
});

test("stripHtml decodes CJK references after removing tags, excerpt drops the WordPress footer", () => {
  assert.equal(stripHtml("<p>&#x9752;&#x5E74;</p>\n<p>OK</p>"), "青年 OK");
  assert.equal(stripHtml("&#60;b&#62;<i>x</i>"), "&#60;b&#62; x");
  assert.equal(stripHtml(null), "");

  const footer = "〈【事實查核】標題〉這篇文章最早發佈於《台灣事實查核中心》。";
  assert.equal(excerpt(`<p>一段摘要。</p><p>${footer}</p>`, 95), "一段摘要。");
  assert.equal(excerpt(`<p>${footer}</p>`, 95), "");
  assert.equal(excerpt("<p>" + "字".repeat(100) + "</p>", 95), "字".repeat(95) + "...");
});
