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

const { normalizeItem } = await import("@/lib/server/rss/normalizeItem");

const DUMMY_FEED = {
  code: "yahoo_health",
  name: "Yahoo健康",
  url: "https://tw.news.yahoo.com/rss/health",
  sourceName: "yahoo_health",
};

test("normalizeItem extracts image from RSS enclosure", () => {
  const item = normalizeItem(DUMMY_FEED, {
    title: "測試新聞 1",
    link: "https://example.com/news/1",
    enclosure: {
      url: "https://example.com/images/real-photo.jpg",
      type: "image/jpeg",
    },
  });
  assert.equal(item.leadImageUrl, "https://example.com/images/real-photo.jpg");
});

test("normalizeItem extracts image from media:content and media:thumbnail", () => {
  const item1 = normalizeItem(DUMMY_FEED, {
    title: "測試新聞 2",
    link: "https://example.com/news/2",
    "media:content": {
      url: "https://example.com/images/media-content.png",
    },
  });
  assert.equal(item1.leadImageUrl, "https://example.com/images/media-content.png");

  const item2 = normalizeItem(DUMMY_FEED, {
    title: "測試新聞 3",
    link: "https://example.com/news/3",
    "media:thumbnail": {
      url: "https://example.com/images/thumb.webp",
    },
  });
  assert.equal(item2.leadImageUrl, "https://example.com/images/thumb.webp");
});

test("normalizeItem extracts raw image URL from Yahoo-style content:encoded", () => {
  const item = normalizeItem(DUMMY_FEED, {
    title: "世界淋巴癌日",
    link: "https://tw.news.yahoo.com/lymphoma-145527358.html",
    description: "45歲的小梅因不願面對身體異狀...",
    "content:encoded": "https://media.zenfs.com/ko/heho_healthy_442/74586b395f1d2b3f35ad9a9d22f18d55.jpg",
  });
  assert.equal(
    item.leadImageUrl,
    "https://media.zenfs.com/ko/heho_healthy_442/74586b395f1d2b3f35ad9a9d22f18d55.jpg",
  );
});

test("normalizeItem extracts img tag src from description HTML", () => {
  const item = normalizeItem(DUMMY_FEED, {
    title: "測試新聞 4",
    link: "https://example.com/news/4",
    description: '<p>今日天氣晴朗<img src="https://example.com/weather-chart.jpg" alt="天氣" />外出記得防曬</p>',
  });
  assert.equal(item.leadImageUrl, "https://example.com/weather-chart.jpg");
});

test("normalizeItem filters out default logo and placeholder icons", () => {
  const item = normalizeItem(DUMMY_FEED, {
    title: "測試新聞 5",
    link: "https://example.com/news/5",
    enclosure: {
      url: "https://s.yimg.com/cv/apiv2/social/images/yahoo_default_logo-1200x1200.png",
      type: "image/png",
    },
  });
  assert.equal(item.leadImageUrl, null);
});
