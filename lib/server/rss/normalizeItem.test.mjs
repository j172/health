// Unit tests for normalizeItem's descriptionHtml source-of-truth choice
// (issue #353) — run with `npm test`.
//
// Same node:test + node:assert setup as rssLeadImageExtraction.test.mjs.
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
  code: "mamaclub",
  name: "媽媽經",
  url: "https://mamaclub.com/feed/",
  sourceName: "mamaclub",
};

test("descriptionHtml prefers content:encoded over a truncated description", () => {
  // The reading that opened #353: mamaclub's <description> is cut to ~119
  // chars plus an ellipsis while content:encoded carries the full article —
  // previously content:encoded was only ever read for its lead image.
  const truncated =
    "曾有一名足月出生、體重僅2200克的低體重兒，經轉診至遺傳科評估，才發現罹患罕見的先天性生長障礙症候群。這類個案在臨床上並不少見，但往往因症狀不典型而延誤診斷時機，家長也常誤以為只是單純的「小隻」...";
  const full =
    "<p>曾有一名足月出生、體重僅2200克的低體重兒，經轉診至遺傳科評估，才發現罹患罕見的先天性生長障礙症候群。</p><p>台北慈濟醫院遺傳醫學中心主任謝秀盈醫師表示，這類個案在臨床上並不少見，及早介入才能掌握治療黃金期。</p><p>※本文由 照護線上 授權使用</p>";

  const item = normalizeItem(DUMMY_FEED, {
    title: "足月出生卻僅2200克 醫揭先天性生長障礙警訊",
    link: "https://mamaclub.com/learn/growth-failure-260827/",
    description: truncated,
    "content:encoded": full,
  });

  assert.equal(item.descriptionHtml, full);
  assert.match(item.descriptionText, /謝秀盈醫師/);
  assert.doesNotMatch(item.descriptionText, /\.\.\.$/);
});

test("descriptionHtml falls back to description when content:encoded is absent", () => {
  const item = normalizeItem(DUMMY_FEED, {
    title: "測試新聞",
    link: "https://example.com/news/1",
    description: "<p>一般描述內容</p>",
  });

  assert.equal(item.descriptionHtml, "<p>一般描述內容</p>");
});

test("descriptionHtml falls back to description when content:encoded is empty", () => {
  const item = normalizeItem(DUMMY_FEED, {
    title: "測試新聞",
    link: "https://example.com/news/2",
    description: "<p>一般描述內容</p>",
    "content:encoded": "   ",
  });

  assert.equal(item.descriptionHtml, "<p>一般描述內容</p>");
});

test("descriptionHtml ignores a Yahoo-style bare image URL in content:encoded", () => {
  // pickLeadImageUrl legitimately reads this same field for the lead image
  // (see rssLeadImageExtraction.test.mjs) — descriptionHtml must not adopt a
  // raw image URL as if it were the article summary.
  const item = normalizeItem(DUMMY_FEED, {
    title: "世界淋巴癌日",
    link: "https://tw.news.yahoo.com/lymphoma-145527358.html",
    description: "45歲的小梅因不願面對身體異狀...",
    "content:encoded":
      "https://media.zenfs.com/ko/heho_healthy_442/74586b395f1d2b3f35ad9a9d22f18d55.jpg",
  });

  assert.equal(item.descriptionHtml, "45歲的小梅因不願面對身體異狀...");
  assert.equal(
    item.leadImageUrl,
    "https://media.zenfs.com/ko/heho_healthy_442/74586b395f1d2b3f35ad9a9d22f18d55.jpg",
  );
});
