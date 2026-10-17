// extractOpenGraphCandidates reads an article page for its card image WITHOUT building a DOM of the whole page
// (issue #699: parsing a 1.5 MB news page with cheerio cost ~75 MB live and ~150 MB of garbage — per item). These
// tests pin that it still finds exactly what the previous whole-document implementation found.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load } from "cheerio";
import { registerRepoHooks } from "../garbageRoutes/testSupport/repoHooks.mjs";

registerRepoHooks();
const { extractOpenGraphCandidates, OG_PAGE_READ_BYTES } = await import("./fetchOpenGraphImage.ts");

/** The implementation this replaced, verbatim in behaviour: one DOM of the entire document. */
const legacyCandidates = (html) => {
  const $ = load(html);
  const ldJson = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const text = $(el).text();
      if (!text || (!text.includes("image") && !text.includes("thumbnailUrl"))) return;
      const data = JSON.parse(text);
      for (const item of Array.isArray(data) ? data : [data]) {
        if (!item || typeof item !== "object") continue;
        const img = item.image || item.thumbnailUrl;
        if (typeof img === "string") ldJson.push(img);
        else if (Array.isArray(img)) {
          for (const sub of img) {
            if (typeof sub === "string") ldJson.push(sub);
            else if (sub && typeof sub === "object" && typeof sub.url === "string") ldJson.push(sub.url);
          }
        } else if (img && typeof img === "object" && typeof img.url === "string") ldJson.push(img.url);
      }
    } catch {
      // ignore invalid json-ld
    }
  });
  return {
    urls: [
      $('meta[property="og:image"]').attr("content"),
      $('meta[property="og:image:secure_url"]').attr("content"),
      $('meta[property="og:image:url"]').attr("content"),
      $('meta[name="twitter:image"]').attr("content"),
      $('meta[name="twitter:image:src"]').attr("content"),
      $('link[rel="image_src"]').attr("href"),
      ...ldJson,
    ].filter((v) => typeof v === "string"),
    alt: $('meta[property="og:image:alt"]').attr("content")?.trim() || null,
  };
};

const page = ({ head = "", body = "" }) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>t</title>${head}</head><body>${body}</body></html>`;

test("candidates come out in preference order: og:image, secure_url, url, twitter:image, image_src, then JSON-LD", () => {
  const html = page({
    head:
      '<link rel="image_src" href="https://x/link.jpg">' +
      '<meta name="twitter:image:src" content="https://x/tw-src.jpg">' +
      '<meta name="twitter:image" content="https://x/tw.jpg">' +
      '<meta property="og:image:url" content="https://x/url.jpg">' +
      '<meta property="og:image:secure_url" content="https://x/secure.jpg">' +
      '<meta property="og:image" content="https://x/og.jpg">' +
      '<meta property="og:image:alt" content="  封面圖  ">' +
      '<script type="application/ld+json">{"image":"https://x/ld.jpg"}</script>',
  });
  const found = extractOpenGraphCandidates(html);
  assert.deepEqual(found.urls, [
    "https://x/og.jpg",
    "https://x/secure.jpg",
    "https://x/url.jpg",
    "https://x/tw.jpg",
    "https://x/tw-src.jpg",
    "https://x/link.jpg",
    "https://x/ld.jpg",
  ]);
  assert.equal(found.alt, "封面圖");
});

test("JSON-LD in every shape the publishers use, in the head or down in the body", () => {
  const html = page({
    head:
      '<script type="application/ld+json">{"@type":"NewsArticle","image":["https://x/a.jpg",{"url":"https://x/b.jpg"}]}</script>',
    body:
      '<p>text</p><script type="application/ld+json">[{"thumbnailUrl":"https://x/c.jpg"},{"image":{"url":"https://x/d.jpg"}}]</script>' +
      "<script type='application/ld+json'>{ not json</script>" +
      '<script type="application/ld+json">{"name":"no image here"}</script>',
  });
  assert.deepEqual(extractOpenGraphCandidates(html).urls, [
    "https://x/a.jpg",
    "https://x/b.jpg",
    "https://x/c.jpg",
    "https://x/d.jpg",
  ]);
});

test("a commented-out JSON-LD block is ignored, as a parser would ignore it", () => {
  const html = page({
    head: '<!-- <script type="application/ld+json">{"image":"https://x/old.jpg"}</script> -->',
    body: '<script type="application/ld+json">{"image":"https://x/live.jpg"}</script>',
  });
  assert.deepEqual(extractOpenGraphCandidates(html).urls, ["https://x/live.jpg"]);
  assert.deepEqual(extractOpenGraphCandidates(html), legacyCandidates(html));
});

test("a page with nothing to offer yields nothing, and a page with no </head> is still read", () => {
  assert.deepEqual(extractOpenGraphCandidates("<html><body><p>hi</p></body></html>"), { urls: [], alt: null });
  assert.deepEqual(extractOpenGraphCandidates('<meta property="og:image" content="https://x/o.jpg"><p>no head tags at all</p>').urls, [
    "https://x/o.jpg",
  ]);
});

test("the body is never parsed: a multi-megabyte page costs the same as a small one", () => {
  const head = '<meta property="og:image" content="https://x/o.jpg">';
  // 6 MB of nested markup that would take ~300 MB as a cheerio DOM.
  const body = "<div><p>段落</p><a href='/x'>連結</a></div>".repeat(150_000);
  const html = page({ head, body });
  assert.ok(html.length > 5_000_000);
  const before = process.memoryUsage().heapUsed;
  const started = process.hrtime.bigint();
  const found = extractOpenGraphCandidates(html);
  const ms = Number(process.hrtime.bigint() - started) / 1e6;
  const grewMb = (process.memoryUsage().heapUsed - before) / 1048576;
  assert.deepEqual(found.urls, ["https://x/o.jpg"]);
  assert.ok(grewMb < 25, `heap grew ${grewMb.toFixed(1)} MB for a ${(html.length / 1048576).toFixed(1)} MB page`);
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms`);
});

test("agrees with the whole-document implementation on every saved HTML fixture and on generated pages", () => {
  const fixtureDir = fileURLToPath(new URL("../rss/__fixtures__/", import.meta.url));
  const files = readdirSync(fixtureDir).filter((name) => name.endsWith(".html"));
  assert.ok(files.length >= 5, "the fixture directory should hold real pages");
  for (const name of files) {
    const html = readFileSync(`${fixtureDir}${name}`, "utf-8");
    assert.deepEqual(extractOpenGraphCandidates(html), legacyCandidates(html), name);
  }

  const generated = [
    page({ head: '<meta property="og:image" content="a.jpg"><meta property="og:image" content="second.jpg">' }),
    page({ head: '<meta name="twitter:image" content="https://x/t.jpg"><link rel="image_src" href="https://x/i.jpg">' }),
    page({ head: '<script type="application/ld+json">{"image":"https://x/l.jpg"}</script>' }),
    "<html><head></head><body></body></html>",
    "",
  ];
  for (const html of generated) {
    assert.deepEqual(extractOpenGraphCandidates(html), legacyCandidates(html), html.slice(0, 80));
  }
});

test("the one deliberate difference: a <meta>/<link> that sits in the BODY is not read (the <head> is what advertises the image)", () => {
  const html = page({ body: '<meta property="og:image" content="https://x/late.jpg">' });
  assert.deepEqual(legacyCandidates(html).urls, ["https://x/late.jpg"]);
  assert.deepEqual(extractOpenGraphCandidates(html).urls, []);
});

test("the read cap is a quarter of a megabyte: roomy for a <head>, tiny next to a news page", () => {
  assert.equal(OG_PAGE_READ_BYTES, 256 * 1024);
});
