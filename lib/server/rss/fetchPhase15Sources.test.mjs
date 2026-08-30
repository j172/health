import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO_ROOT = new URL("../../../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    let target = specifier;
    let parentURL = context.parentURL;
    if (specifier.startsWith("@/")) {
      target = `./${specifier.slice(2)}`;
      parentURL = REPO_ROOT.href;
    }
    if (target.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(target)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
});

const { parseFeedXml } = await import("./parseRss.ts");
const { RSS_FEEDS } = await import("../config/rss-feeds.ts");
const { getSourceLabel, hasSourceLabel } = await import("../news/sourceLabels.ts");
const { SOURCE_CATEGORIES } = await import("../news/sourceCategories.ts");

test("Phase 15: new RSS feeds are registered in RSS_FEEDS config", () => {
  const codes = RSS_FEEDS.map((f) => f.code);
  assert.ok(codes.includes("udn_woman"), "udn_woman must be registered");
  assert.ok(codes.includes("ilady_life"), "ilady_life must be registered");
  assert.ok(codes.includes("lianhonghong"), "lianhonghong must be registered");
});

test("Phase 15: parseFeedXml parses Atom feeds (lianhonghong structure)", () => {
  const feed = {
    code: "lianhonghong",
    name: "臉紅紅",
    url: "https://feeds.feedburner.com/lianhonghong",
    sourceName: "lianhonghong",
  };

  const sampleAtom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xml:lang="zh-TW" xmlns="http://www.w3.org/2005/Atom">
  <title>臉紅紅 Lianhonghong</title>
  <entry>
    <title>七夕親密指南：創造心動連結</title>
    <link rel="alternate" type="text/html" href="https://lianhonghong.com/read/article/99999"/>
    <published>2026-08-25T12:00:00+08:00</published>
    <summary>這是一篇關於親密關係的專題文章介紹。</summary>
  </entry>
</feed>`;

  const items = parseFeedXml(feed, sampleAtom);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "七夕親密指南：創造心動連結");
  assert.equal(items[0].canonicalUrl, "https://lianhonghong.com/read/article/99999");
  assert.equal(items[0].descriptionText, "這是一篇關於親密關係的專題文章介紹。");
  assert.equal(items[0].sourceName, "lianhonghong");
});

test("Phase 15: parseFeedXml parses RSS 2.0 feeds (UDN woman & iLady)", () => {
  const feed = {
    code: "udn_woman",
    name: "udn 女子漾",
    url: "https://woman.udn.com/woman/rssfeed/123166",
    sourceName: "udn_woman",
  };

  const sampleRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>udn 女子漾</title>
    <item>
      <title>夏日美妝與肌膚保養之道</title>
      <link>https://woman.udn.com/woman/story/123166/123456</link>
      <pubDate>Thu, 27 Aug 2026 19:00:00 +0800</pubDate>
      <description>保養專家分享換季肌膚管理重點。</description>
    </item>
  </channel>
</rss>`;

  const items = parseFeedXml(feed, sampleRss);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, "夏日美妝與肌膚保養之道");
  assert.equal(items[0].canonicalUrl, "https://woman.udn.com/woman/story/123166/123456");
  assert.equal(items[0].descriptionText, "保養專家分享換季肌膚管理重點。");
});

test("Phase 15: source labels and categories are mapped for all 7 new sources", () => {
  const expected = [
    ["udn_woman", "udn 女子漾"],
    ["ilady", "iLady 愛女也"],
    ["lianhonghong", "臉紅紅"],
    ["sungful", "嵩馥性健康管理中心"],
    ["mamibuy", "媽咪拜"],
    ["tasctaiwan", "台灣性諮商學會"],
    ["tase", "台灣性教育學會"],
  ];

  for (const [key, label] of expected) {
    assert.ok(hasSourceLabel(key), `hasSourceLabel must return true for ${key}`);
    assert.equal(getSourceLabel(key), label, `getSourceLabel(${key}) should match`);
  }

  const mediaCategory = SOURCE_CATEGORIES.find((c) => c.key === "media");
  assert.ok(mediaCategory, "media category must exist");
  const mediaSourceNames = mediaCategory.sources.map((s) => s.sourceName);

  for (const [key] of expected) {
    assert.ok(mediaSourceNames.includes(key), `media category must contain ${key}`);
  }
});

