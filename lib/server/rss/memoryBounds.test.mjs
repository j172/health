// The two places the RSS ingestion used to do per-item work it then threw away (issue #699), pinned to give exactly
// the answers they gave before:
//   - parseFeedXmlGated : gate on freshness BEFORE normalizing (cheerio + SHA-256 per entry)
//   - stripInertMarkup  : drop <script>/<style> before the DOM of a detail page is built
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const { load } = await import("cheerio");
const { parseFeedXml, parseFeedXmlGated } = await import("./parseRss.ts");
const { partitionByFreshness } = await import("./freshness.ts");
const { extractDetailContent, stripInertMarkup, DETAIL_PAGE_MAX_CHARS } = await import("./fetchDetailPage.ts");

// ---- parseFeedXmlGated ------------------------------------------------------------------------------------

const NOW = new Date("2026-10-16T12:00:00Z");
const FEED = { code: "test", name: "測試", url: "https://x/rss", sourceName: "test" };
const daysAgo = (days) => new Date(NOW.getTime() - days * 86_400_000).toUTCString();

const item = ({ title = "標題", link, pubDate, extra = "" }) =>
  `<item>${title === null ? "" : `<title>${title}</title>`}${link === null ? "" : `<link>${link}</link>`}` +
  `${pubDate ? `<pubDate>${pubDate}</pubDate>` : ""}<description><![CDATA[<p>內文 ${link}</p>]]></description>${extra}</item>`;

const rss = (...items) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.join("")}</channel></rss>`;

const twoStep = (xml) => {
  const items = parseFeedXml(FEED, xml);
  const gated = partitionByFreshness(items, NOW);
  return { total: items.length, fresh: gated.fresh, staleRejected: gated.rejected.length };
};

test("parseFeedXmlGated gives exactly the split parseFeedXml + partitionByFreshness gave", () => {
  const xml = rss(
    item({ link: "https://x/fresh-1", pubDate: daysAgo(1) }),
    item({ link: "https://x/fresh-2", pubDate: daysAgo(89) }),
    item({ link: "https://x/old", pubDate: daysAgo(200) }),
    item({ link: "https://x/older", pubDate: daysAgo(4000) }),
    item({ link: "https://x/future", pubDate: daysAgo(-30) }),
    item({ link: "https://x/no-date" }),
    item({ title: null, link: "https://x/no-title", pubDate: daysAgo(1) }),
    item({ link: null, pubDate: daysAgo(1) }),
    item({ link: "https://x/bad-date", pubDate: "not a date" }),
  );
  const expected = twoStep(xml);
  const actual = parseFeedXmlGated(FEED, xml, NOW);

  assert.equal(actual.total, expected.total, "entries with a title and a link");
  assert.equal(actual.staleRejected, expected.staleRejected);
  assert.deepEqual(actual.fresh, expected.fresh, "the fresh items are fully normalized, identically");
  assert.deepEqual(
    actual.fresh.map((i) => i.canonicalUrl),
    ["https://x/fresh-1", "https://x/fresh-2", "https://x/no-date", "https://x/bad-date"],
  );
  assert.equal(actual.total, 7);
  assert.equal(actual.staleRejected, 3);
});

test("parseFeedXmlGated agrees on an Atom feed, a single-item feed and an empty one", () => {
  const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>新</title><link href="https://x/a1"/><updated>${new Date(NOW.getTime() - 3_600_000).toISOString()}</updated><summary>s</summary></entry>
    <entry><title>舊</title><link href="https://x/a2"/><updated>2015-01-01T00:00:00Z</updated><summary>s</summary></entry></feed>`;
  const single = rss(item({ link: "https://x/only", pubDate: daysAgo(2) }));
  for (const xml of [atom, single, rss(), "<rss><channel></channel></rss>", "<nothing/>"]) {
    const expected = twoStep(xml);
    const actual = parseFeedXmlGated(FEED, xml, NOW);
    assert.deepEqual(
      { total: actual.total, fresh: actual.fresh, staleRejected: actual.staleRejected },
      expected,
      xml.slice(0, 60),
    );
  }
});

test("a stale entry is never normalized: its (expensive) description is not parsed at all", () => {
  // normalizeItem reads description/content:encoded; a getter that throws proves it was not touched. fast-xml-parser
  // yields plain objects, so wrap the parser result by feeding an entry whose description would be enormous instead:
  const huge = "<p>" + "段落 ".repeat(300_000) + "</p>"; // ~1 MB of HTML
  const xml = rss(
    item({ link: "https://x/stale", pubDate: daysAgo(500), extra: `<content:encoded><![CDATA[${huge}]]></content:encoded>` }),
    item({ link: "https://x/fresh", pubDate: daysAgo(1) }),
  );
  const time = (fn) => {
    const started = process.hrtime.bigint();
    const value = fn();
    return { value, ms: Number(process.hrtime.bigint() - started) / 1e6 };
  };
  // best of three, so one slow scheduling slice on a busy machine cannot decide it
  const best = (fn) => Array.from({ length: 3 }, () => time(fn)).sort((a, b) => a.ms - b.ms)[0];
  const gated = best(() => parseFeedXmlGated(FEED, xml, NOW));
  const full = best(() => parseFeedXml(FEED, xml));

  assert.equal(gated.value.staleRejected, 1);
  assert.equal(gated.value.fresh.length, 1);
  // parseFeedXml cheerio-parses and hashes the 1 MB description; the gated form must not. (Loose on purpose: timing.)
  assert.ok(gated.ms < full.ms, `gated ${gated.ms.toFixed(1)} ms should beat full ${full.ms.toFixed(1)} ms`);
});

// ---- stripInertMarkup -------------------------------------------------------------------------------------

const links = (container, $) => container.find("a[href]").toArray().map((el) => $(el).attr("href"));
const images = (container, $) => container.find("img[src]").toArray().map((el) => $(el).attr("src"));

const project = (html, url) => {
  const $ = load(html);
  const { scopedContainer, detailContainer, detailHtml, detailText } = extractDetailContent($, url);
  return { detailHtml, detailText, links: links(detailContainer, $), images: scopedContainer ? images(scopedContainer, $) : null };
};

test("dropping <script>/<style> first changes nothing extractDetailContent returns, on every saved detail page", () => {
  const dir = fileURLToPath(new URL("./__fixtures__/", import.meta.url));
  const files = readdirSync(dir).filter((name) => name.endsWith(".html"));
  assert.ok(files.length >= 5);
  for (const name of files) {
    const html = readFileSync(`${dir}${name}`, "utf-8");
    assert.deepEqual(project(stripInertMarkup(html), "https://www.mohw.gov.tw/x"), project(html, "https://www.mohw.gov.tw/x"), name);
  }
});

test("…and on a modern page that is mostly scripts, where it also makes the DOM a fraction of the size", () => {
  const state = JSON.stringify({ blob: "資料".repeat(40_000) });
  const html =
    `<!doctype html><html><head><meta property="og:image" content="https://x/o.jpg"><style>.a{color:red}</style>` +
    `<script type="application/ld+json">{"image":"https://x/ld.jpg"}</script><script>window.__NEXT_DATA__=${state}</script></head>` +
    `<body><main><article><h1>標題</h1><p>內文 <a href="/dl-1.pdf">附件</a></p><img src="/a.jpg" alt="圖">` +
    `<script>var a="</div>";</script><style>p{margin:0}</style><p>第二段</p></article></main><script>${"x".repeat(100_000)}</script></body></html>`;

  const stripped = stripInertMarkup(html);
  assert.ok(stripped.length < html.length / 5, `${html.length} -> ${stripped.length}`);
  assert.ok(stripped.includes('property="og:image"'), "meta tags survive: og:image is still found");
  assert.deepEqual(project(stripped, "https://x/p"), project(html, "https://x/p"));
});

test("an unterminated <script> is left for the parser, and case/attributes are handled like the parser would", () => {
  assert.equal(stripInertMarkup("<p>a</p><script>never closed"), "<p>a</p><script>never closed");
  assert.equal(stripInertMarkup('<p>a</p><SCRIPT type="x" src="y">1</SCRIPT ><p>b</p>'), "<p>a</p><p>b</p>");
  assert.equal(stripInertMarkup("<style>a{}</style>x<STYLE>b{}</STYLE>"), "x");
  assert.equal(stripInertMarkup("<p>no inert blocks</p>"), "<p>no inert blocks</p>");
});

test("a comment that merely MENTIONS <style> or <script> is not paired with a later closing tag (the heho fixture's header did exactly that)", () => {
  const html =
    "<!-- note: <style>/<script> blocks were shortened -->" +
    "<main><article><p>文章內容</p></article></main><style>.x{}</style><!-- <script> --><p>尾</p>";
  assert.equal(
    stripInertMarkup(html),
    "<!-- note: <style>/<script> blocks were shortened --><main><article><p>文章內容</p></article></main><!-- <script> --><p>尾</p>",
  );
  assert.deepEqual(project(stripInertMarkup(html), "https://x/p"), project(html, "https://x/p"));
});

test("the markup ceiling is set well under what would need hundreds of MB as a DOM", () => {
  assert.ok(DETAIL_PAGE_MAX_CHARS >= 500_000 && DETAIL_PAGE_MAX_CHARS <= 1_000_000);
});
