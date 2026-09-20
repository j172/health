import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";

// Same resolver shim the other lib tests use: Node's ESM resolver has no
// extensionless resolution, so a relative import of a .ts sibling needs help.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]sx?$/.test(specifier)) {
      for (const extension of [".ts", ".tsx"]) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(specifier + extension, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const { resolveHeroImage } = await import("./heroImage.ts");

// Base fixture with no stock-photo fallback, so the article-asset branch is
// what's under test in each case below.
const baseNews = {
  id: 1014118,
  source_name: "國民健康署",
  feed_code: "hpa",
  feed_name: "國民健康署",
  title: "買菜動一動",
  dept_name: null,
  published_at_utc: null,
  canonical_url: "https://www.hpa.gov.tw/example",
  description_html: null,
  card_image_url: null,
  card_image_source: null,
  card_image_source_page_url: null,
  card_image_contributor: null,
  detail_html: null,
  detail_text: null,
  meta_title: null,
  meta_description: null,
  keywords: null,
  geo_summary: null,
};

test("resolveHeroImage accepts a site-relative locally re-hosted image path (issue #352, news id 1014118)", () => {
  const assets = [
    {
      id: 1,
      asset_type: "image",
      title: "買菜動一動",
      url: "/images/news/articles/article-8da7b6a828d3df185888bcb2.jpg",
      sort_order: 0,
    },
  ];

  const hero = resolveHeroImage(baseNews, assets);

  assert.deepEqual(hero, {
    url: "/images/news/articles/article-8da7b6a828d3df185888bcb2.jpg",
    caption: "買菜動一動",
    attribution: null,
  });
});

test("resolveHeroImage still accepts an absolute http(s) URL (pre-2026-07-26 hotlinked data)", () => {
  const assets = [
    {
      id: 2,
      asset_type: "image",
      title: "舊資料熱連結圖片",
      url: "https://www.hpa.gov.tw/images/old-hotlinked.jpg",
      sort_order: 0,
    },
  ];

  const hero = resolveHeroImage(baseNews, assets);

  assert.deepEqual(hero, {
    url: "https://www.hpa.gov.tw/images/old-hotlinked.jpg",
    caption: "舊資料熱連結圖片",
    attribution: null,
  });
});

test("resolveHeroImage rejects a protocol-relative URL and a bare filename as garbage, not a local path", () => {
  const assets = [
    { id: 3, asset_type: "image", title: "protocol-relative", url: "//evil.example/x.jpg", sort_order: 0 },
    { id: 4, asset_type: "image", title: "bare filename", url: "article-nopath.jpg", sort_order: 1 },
  ];

  assert.equal(resolveHeroImage(baseNews, assets), null);
});
