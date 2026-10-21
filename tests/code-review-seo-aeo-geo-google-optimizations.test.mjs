import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

test("DB schema unique keys prevent time-series table bloat and upsertCwaRainfall updates obs_time", () => {
  const schema = read("lib/server/db/schema.ts");
  assert.match(schema, /UNIQUE KEY uq_aqi_reading \(site_id\)/);
  assert.match(schema, /UNIQUE KEY uq_pm25_reading \(site_name\)/);
  assert.match(schema, /UNIQUE KEY uq_cwa_station_weather \(dataset_id, station_id\)/);
  assert.match(schema, /UNIQUE KEY uq_cwa_rainfall \(station_id\)/);

  const cwaQueries = read("lib/server/cwa/queries.ts");
  assert.match(cwaQueries, /obs_time = VALUES\(obs_time\)/);
});

test("All 86 TOOL_CATALOG slugs are in INDEXABLE_SLUGS and no tool page.tsx has conflicting robots noindex", () => {
  const catalogSrc = read("lib/server/tools/catalog.ts");
  const slugMatches = [...catalogSrc.matchAll(/^\s*slug:\s*"([^"]+)"/gm)].map((m) => m[1]);
  assert.equal(slugMatches.length, 86, "Expected 86 tools in TOOL_CATALOG");

  const indexableBlock = catalogSrc.match(/const INDEXABLE_SLUGS\s*=\s*new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(indexableBlock, "INDEXABLE_SLUGS set must exist");
  for (const slug of slugMatches) {
    assert.match(
      indexableBlock[1],
      new RegExp(`"${slug}"`),
      `Expected ${slug} to be in INDEXABLE_SLUGS`,
    );
  }

  const zhToolsDir = path.join(ROOT, "app/(zh)/tools");
  for (const entry of fs.readdirSync(zhToolsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "category" || entry.name === "guide") continue;
    const pagePath = path.join(zhToolsDir, entry.name, "page.tsx");
    if (fs.existsSync(pagePath)) {
      const content = fs.readFileSync(pagePath, "utf8");
      assert.doesNotMatch(
        content,
        /robots:\s*\{\s*index:\s*false/,
        `app/(zh)/tools/${entry.name}/page.tsx should not have conflicting robots: { index: false }`,
      );
    }
  }
});

test("SEO/AEO/GEO metadata covers all 8 core domains, dual Taiwan/臺灣 keywords, and Dataset JSON-LD", () => {
  const seoSrc = read("lib/server/news/seo.ts");
  assert.match(
    seoSrc,
    /長照、兒少、健康計算、醫療照護、交通能源、防災示警、遠離詐騙與成癮/,
    "SITE_DESCRIPTION must cover all 8 domains",
  );
  assert.match(seoSrc, /export const SITE_KEYWORDS = \[/);
  assert.match(seoSrc, /"台灣便民工具"/);
  assert.match(seoSrc, /"臺灣便民生活工具"/);
  assert.match(seoSrc, /"@type": "Dataset"/);
  assert.match(seoSrc, /"#category-description"/);
});

test("/llm-info removes hallucinated calculators and reflects current 8 domains and 4 locales", () => {
  const llmInfo = read("app/(zh)/llm-info/LlmInfoClient.tsx");
  assert.doesNotMatch(llmInfo, /eGFR/);
  assert.doesNotMatch(llmInfo, /KDIGO/);
  assert.doesNotMatch(llmInfo, /ASCVD/);
  assert.match(llmInfo, /English \(en\), Japanese \(ja\), and Korean \(ko\)/);
  assert.match(llmInfo, /長照補助與機構查詢、兒少托育與福利/);
});

test("/tools index uses dynamic TOOL_CATALOG.length and maps all 86 tool slugs in TOOL_ICONS", () => {
  const toolsPage = read("app/(zh)/tools/page.tsx");
  assert.doesNotMatch(toolsPage, /30\+\s*款/);
  assert.match(toolsPage, /TOOL_CATALOG\.length/);

  const catalogSrc = read("lib/server/tools/catalog.ts");
  const slugMatches = [...catalogSrc.matchAll(/^\s*slug:\s*"([^"]+)"/gm)].map((m) => m[1]);
  for (const slug of slugMatches) {
    const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyRegex = new RegExp(`(?:"${escaped}"|\\b${escaped}\\b)\\s*:`);
    assert.match(toolsPage, keyRegex, `Expected TOOL_ICONS in app/(zh)/tools/page.tsx to map ${slug}`);
  }
});

test("/tools/category/[slug] renders #category-description and cross-links related life-situation GUIDES", () => {
  const categoryPage = read("app/(zh)/tools/category/[slug]/page.tsx");
  assert.match(categoryPage, /id="category-description"/);
  assert.match(categoryPage, /相關生活情境指南/);
  assert.match(categoryPage, /GUIDES\.filter/);
});

test("Free Google Tools integration: Gemini free-tier fallback via httpRequest and Safe Browsing check link", () => {
  const aiClient = read("lib/server/cloudflare/aiClient.ts");
  assert.match(aiClient, /export const runGeminiAiChat = async/);
  assert.match(aiClient, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(aiClient, /httpRequest/);

  const antiFraud = read("app/(zh)/tools/anti-fraud/AntiFraudChecker.tsx");
  assert.match(antiFraud, /https:\/\/transparencyreport\.google\.com\/safe-browsing\/search\?url=/);
});

