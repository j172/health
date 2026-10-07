import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    if (target.startsWith("@/")) {
      target = target.slice(2);
      const url = new URL(target, REPO_ROOT);
      for (const ext of [".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.js"]) {
        const candidate = new URL(target + ext, REPO_ROOT);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(candidate.href, context);
        }
      }
      return nextResolve(url.href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { RSS_FEEDS } = await import("@/lib/server/config/rss-feeds");
const { getSourceLabel, hasSourceLabel, resolveAuthorLabel } = await import(
  "@/lib/server/news/sourceLabels"
);
const { SOURCE_CATEGORIES, isGovSource } = await import(
  "@/lib/server/news/sourceCategories"
);
const { getArticleDestination } = await import("@/lib/format/outboundLink");
const { normalizeItem } = await import("@/lib/server/rss/normalizeItem");

test("twreporter: RSS_FEEDS contains valid twreporter_news config with skipDetailFetch", () => {
  const feed = RSS_FEEDS.find((f) => f.code === "twreporter_news");
  assert.ok(feed, "twreporter_news feed config should exist in RSS_FEEDS");
  assert.equal(feed.name, "報導者");
  assert.equal(feed.url, "https://www.twreporter.org/a/rss2.xml");
  assert.equal(feed.sourceName, "twreporter");
  assert.equal(feed.skipDetailFetch, true, "twreporter should set skipDetailFetch: true for outbound routing");
});

test("twreporter: sourceLabels registers twreporter with label '報導者'", () => {
  assert.equal(hasSourceLabel("twreporter"), true);
  assert.equal(getSourceLabel("twreporter"), "報導者");
  const author = resolveAuthorLabel({
    dept_name: null,
    source_name: "twreporter",
    feed_name: "報導者",
  });
  assert.equal(author, "報導者");
});

test("twreporter: sourceCategories categorizes twreporter under 'npo' (公益社福)", () => {
  assert.equal(isGovSource("twreporter"), false, "twreporter is not a government source");
  const npoCat = SOURCE_CATEGORIES.find((c) => c.key === "npo");
  assert.ok(npoCat, "npo category should exist");
  const twreporterEntry = npoCat.sources.find((s) => s.sourceName === "twreporter");
  assert.ok(twreporterEntry, "twreporter should be in npo category");
  assert.equal(twreporterEntry.label, "報導者");
});

test("twreporter: non-gov outbound link routing applies with UTM parameters", () => {
  const item = {
    id: 999999,
    source_name: "twreporter",
    canonical_url: "https://www.twreporter.org/a/opinion-clerks-of-the-court-shortage",
    title: "【投書】週工時為勞工1.6倍，書記官在公務員人力危機下深陷「司法地獄」",
  };
  const destination = getArticleDestination(item, "news_card");
  assert.equal(destination.isExternal, true);
  assert.equal(destination.target, "_blank");
  assert.equal(destination.rel, "noopener noreferrer");
  assert.ok(destination.href.startsWith("https://www.twreporter.org/a/opinion-clerks-of-the-court-shortage?"));
  assert.ok(destination.href.includes("utm_source=health.j172.tw"));
  assert.ok(destination.href.includes("utm_medium=news_card"));
  assert.ok(destination.href.includes("utm_campaign=news_source"));
});

test("twreporter: normalizeItem extracts enclosure image correctly", () => {
  const feed = RSS_FEEDS.find((f) => f.code === "twreporter_news");
  const rawRssItem = {
    title: "【投書】週工時為勞工1.6倍，書記官在公務員人力危機下深陷「司法地獄」",
    link: "https://www.twreporter.org/a/opinion-clerks-of-the-court-shortage",
    description: "當大多數政府公文系統，都朝向數位電子化的現在，司法體系依舊停留在上個世紀以紙本為核心的作業流程。",
    guid: "https://www.twreporter.org/a/opinion-clerks-of-the-court-shortage",
    pubDate: "Sun, 04 Oct 2026 16:00:00 GMT",
    enclosure: {
      url: "https://www.twreporter.org/images/20261002140122-e1d351902cfa43e5b4cab3e1b9569711-mobile.jpg",
      length: "0",
      type: "image/jpeg",
    },
  };
  const normalized = normalizeItem(feed, rawRssItem);
  assert.equal(normalized.sourceName, "twreporter");
  assert.equal(normalized.feedCode, "twreporter_news");
  assert.equal(normalized.title, "【投書】週工時為勞工1.6倍，書記官在公務員人力危機下深陷「司法地獄」");
  assert.equal(normalized.leadImageUrl, "https://www.twreporter.org/images/20261002140122-e1d351902cfa43e5b4cab3e1b9569711-mobile.jpg");
  assert.equal(normalized.canonicalUrl, "https://www.twreporter.org/a/opinion-clerks-of-the-court-shortage");
});
