import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #444: shared llms.txt (https://llmstxt.org/) + clean full-page
// Markdown generator, wired to 5 existing public page types (tool pages,
// official-only news articles, /privacy, /accessibility, /llm-info).
//
// lib/server/content/*.ts are plain .ts with no JSX, so this file
// dynamically imports and exercises them directly (same loader shim as
// lib/server/tools/navModel.test.mjs / tests/tools-category-pages-459.test.mjs).
// The 5 page components and the 10 route.ts files are verified via
// source-text inspection — route.ts handlers for /news/[id] hit a real DB
// connection through lib/server/news/queries.ts, so they are not invoked
// directly here; everything DB-free is exercised through the pure adapters
// instead.

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const REPO_ROOT = new URL("../", import.meta.url);

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
      for (const extension of [".ts", ".tsx", ".mjs", ".js"]) {
        const candidate = new URL(target + extension, parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(target + extension, { ...context, parentURL });
        }
      }
    }
    return nextResolve(target, { ...context, parentURL });
  },
  // lib/i18n/dictionary.ts imports the locale files relying on
  // TypeScript's resolveJsonModule (as every other .ts file importing a
  // .json does in this repo) — no `with { type: "json" }` import
  // attribute. Plain `node --test` requires that attribute for the
  // *default* JSON load path, so this intercepts .json URLs and returns
  // their parsed-as-JSON source directly instead, sidestepping the
  // attribute requirement entirely (issue #488 pulled this chain in via
  // toolLlmsPage.ts's new locale-aware adapter — same hook as
  // tests/i18n-routing-485.test.mjs).
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { buildLlmsTxt, buildLlmsMarkdown } = await import("../lib/server/content/llmsPage.ts");
const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
const { buildToolLlmsPageContent, TOOL_MEDICAL_DISCLAIMER } = await import(
  "../lib/server/content/toolLlmsPage.ts"
);
const { buildNewsLlmsPageContent } = await import("../lib/server/content/newsLlmsPage.ts");
const { buildPrivacyLlmsPageContent } = await import("../lib/server/content/privacyContent.ts");
const { buildAccessibilityLlmsPageContent } = await import(
  "../lib/server/content/accessibilityContent.ts"
);
const { buildLlmInfoLlmsPageContent } = await import("../lib/server/content/llmInfoContent.ts");

const BASE_URL = "https://health.j172.tw";

// ---------------------------------------------------------------------------
// 1. buildLlmsTxt: llms.txt grammar (H1, blockquote summary, ## sections,
//    full absolute-URL links) for a representative tool/news/static input
// ---------------------------------------------------------------------------

test("buildLlmsTxt produces valid llms.txt grammar for a representative tool page", () => {
  const bmi = TOOL_CATALOG.find((t) => t.slug === "bmi");
  assert.ok(bmi, "TOOL_CATALOG must have a bmi entry to test against");
  const content = buildToolLlmsPageContent(bmi, BASE_URL);
  const text = buildLlmsTxt(content);

  assert.ok(text.startsWith(`# ${bmi.title}\n`), "must start with an H1 title line");
  assert.ok(text.includes(`\n> ${bmi.directAnswer}\n`), "must have a one-line blockquote summary");
  assert.ok(text.includes("## 資料來源 (Data Sources)"), "must have a data-sources section");
  assert.ok(text.includes("## 相關頁面 (Related Pages)"), "must have a related-pages section");
  assert.ok(text.includes("## 常見問題 (FAQ)"), "must have an FAQ section");

  // Every markdown link in the body must be a full absolute URL.
  const linkUrls = [...text.matchAll(/\]\((https?:\/\/[^)]*|[^)]*)\)/g)].map((m) => m[1]);
  assert.ok(linkUrls.length > 0, "must contain at least one link");
  for (const url of linkUrls) {
    assert.ok(/^https?:\/\//.test(url), `link "${url}" must be a full absolute URL`);
  }
});

test("buildLlmsTxt produces valid llms.txt grammar for a representative official news article", () => {
  const news = {
    id: 123,
    title: "測試官方新聞標題",
    source_name: "mohw",
    feed_name: "衛生福利部",
    dept_name: "衛生福利部",
    canonical_url: "https://www.mohw.gov.tw/announcement/123",
    detail_html: "<p>這是一篇測試用的官方新聞內容。</p>",
    description_html: null,
    meta_description: "測試用的摘要說明。",
    geo_summary: "一句話的核心重點摘要。",
    published_at_utc: new Date("2026-01-01T00:00:00Z"),
  };
  const content = buildNewsLlmsPageContent(news, BASE_URL);
  assert.ok(content, "an official-source article must produce content");
  const text = buildLlmsTxt(content);

  assert.ok(text.startsWith(`# ${news.title}\n`));
  assert.ok(text.includes(`\n> ${news.geo_summary}\n`));
  assert.ok(text.includes("## 資料來源 (Data Sources)"));
  assert.ok(text.includes(news.canonical_url));
});

test("buildLlmsTxt produces valid llms.txt grammar for a representative static page (privacy)", () => {
  const content = buildPrivacyLlmsPageContent(BASE_URL);
  const text = buildLlmsTxt(content);

  assert.ok(text.startsWith(`# ${content.title}\n`));
  assert.ok(text.includes(`\n> ${content.summary}\n`));
  assert.ok(text.includes(`${BASE_URL}/accessibility`), "related pages must be full absolute URLs");
});

// ---------------------------------------------------------------------------
// 2. buildLlmsMarkdown: clean full-page Markdown, no nav/footer/script
// ---------------------------------------------------------------------------

test("buildLlmsMarkdown excludes nav/footer/script markup for a tool page", () => {
  const bmi = TOOL_CATALOG.find((t) => t.slug === "bmi");
  const content = buildToolLlmsPageContent(bmi, BASE_URL);
  const markdown = buildLlmsMarkdown(content);

  assert.ok(markdown.startsWith(`# ${bmi.title}\n`));
  assert.ok(markdown.includes(TOOL_MEDICAL_DISCLAIMER), "must include the shared medical disclaimer text");
  for (const forbidden of ["<nav", "<footer", "<script", "<header", "StabloHeader", "StabloFooter"]) {
    assert.ok(!markdown.includes(forbidden), `markdown must not contain "${forbidden}"`);
  }
});

test("buildLlmsMarkdown excludes nav/footer/script markup for an official news article", () => {
  const news = {
    id: 456,
    title: "另一篇測試官方新聞",
    source_name: "cdc",
    feed_name: "疾病管制署",
    dept_name: "疾病管制署",
    canonical_url: "https://www.cdc.gov.tw/announcement/456",
    detail_html: "<p>疫情監測內容本體。</p><script>alert(1)</script>",
    description_html: null,
    meta_description: null,
    geo_summary: "疫情監測重點摘要。",
    published_at_utc: new Date("2026-02-01T00:00:00Z"),
  };
  const content = buildNewsLlmsPageContent(news, BASE_URL);
  assert.ok(content);
  const markdown = buildLlmsMarkdown(content);

  assert.ok(markdown.includes("疫情監測內容本體"), "must include the article's own body text");
  // stripHtml strips all tags, including any <script> embedded in detail_html,
  // leaving no executable markup behind.
  assert.ok(!markdown.includes("<script"), "must not retain a <script> tag from the article body");
  for (const forbidden of ["<nav", "<footer", "StabloHeader", "StabloFooter"]) {
    assert.ok(!markdown.includes(forbidden));
  }
});

test("buildLlmsMarkdown excludes nav/footer/script markup for accessibility and llm-info static pages", () => {
  for (const content of [
    buildAccessibilityLlmsPageContent(BASE_URL),
    buildLlmInfoLlmsPageContent(BASE_URL),
  ]) {
    const markdown = buildLlmsMarkdown(content);
    for (const forbidden of ["<nav", "<footer", "<script", "StabloHeader", "StabloFooter"]) {
      assert.ok(!markdown.includes(forbidden), `markdown must not contain "${forbidden}"`);
    }
  }
});

// ---------------------------------------------------------------------------
// 3. "僅官方新聞" gating: a non-official source must not produce content
// ---------------------------------------------------------------------------

test("buildNewsLlmsPageContent returns null for a non-official (third-party media) source", () => {
  const nonGovNews = {
    id: 789,
    title: "一篇來自媒體的新聞",
    source_name: "udn_health", // 元氣網（聯合報健康）— media, not gov, per SOURCE_CATEGORIES
    feed_name: "元氣網（聯合報健康）",
    dept_name: null,
    canonical_url: "https://health.udn.com/health/story/789",
    detail_html: "<p>媒體報導內容。</p>",
    description_html: null,
    meta_description: "媒體摘要",
    geo_summary: null,
    published_at_utc: new Date("2026-03-01T00:00:00Z"),
  };
  assert.equal(buildNewsLlmsPageContent(nonGovNews, BASE_URL), null);
});

test("buildNewsLlmsPageContent returns content for every SOURCE_CATEGORIES gov source", async () => {
  const { SOURCE_CATEGORIES } = await import("../lib/server/news/sourceCategories.ts");
  const govCategory = SOURCE_CATEGORIES.find((c) => c.key === "gov");
  assert.ok(govCategory && govCategory.sources.length > 0);

  for (const { sourceName } of govCategory.sources) {
    const news = {
      id: 1,
      title: `官方新聞 - ${sourceName}`,
      source_name: sourceName,
      feed_name: "測試頻道",
      dept_name: null,
      canonical_url: "https://example.gov.tw/announcement/1",
      detail_html: "<p>內容</p>",
      description_html: null,
      meta_description: "摘要",
      geo_summary: null,
      published_at_utc: null,
    };
    assert.notEqual(
      buildNewsLlmsPageContent(news, BASE_URL),
      null,
      `source "${sourceName}" is listed under SOURCE_CATEGORIES' "gov" key and must produce content`,
    );
  }
});

// ---------------------------------------------------------------------------
// 4. Same data source as the HTML page — no second, drifting content copy
// ---------------------------------------------------------------------------

test("buildToolLlmsPageContent is derived from the live TOOL_CATALOG entry, not a re-derivation", () => {
  for (const tool of TOOL_CATALOG.slice(0, 5)) {
    const content = buildToolLlmsPageContent(tool, BASE_URL);
    assert.equal(content.title, tool.title);
    assert.equal(content.summary, tool.directAnswer);
    assert.equal(content.faqs, tool.faqs);
    assert.equal(content.url, `${BASE_URL}/tools/${tool.slug}`);
  }
});

test("buildToolLlmsPageContent resolves relatedSlugs to real TOOL_CATALOG entries with absolute URLs", () => {
  const withRelated = TOOL_CATALOG.find((t) => t.relatedSlugs.length > 0);
  assert.ok(withRelated, "at least one tool must have relatedSlugs to test against");
  const content = buildToolLlmsPageContent(withRelated, BASE_URL);
  assert.equal(content.related.length, withRelated.relatedSlugs.length);
  for (const link of content.related) {
    assert.ok(link.url.startsWith(`${BASE_URL}/tools/`));
  }
});

// ---------------------------------------------------------------------------
// 5. HTML <link> declaration tags — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const readSource = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

test("ToolPageShell.tsx declares its own per-tool llms.txt + markdown <link> tags, locale-aware (issue #488)", () => {
  const src = readSource("components", "Tools", "ToolPageShell.tsx");
  // Issue #488: the href must route through buildLocalizedPath(...) so a
  // /{locale}/tools/<slug> page's <link> points at that locale's own
  // llms.txt/markdown sibling, not always the zh /tools/<slug> one (which
  // buildLocalizedPath still resolves to for locale "zh-TW", so the zh page
  // behaves byte-for-byte as before).
  assert.ok(
    /<link[\s\S]*?rel="alternate"[\s\S]*?type="text\/plain"[\s\S]*?href=\{`\$\{buildLocalizedPath\(`\/tools\/\$\{slug\}`,\s*locale\)\}\/llms\.txt`\}/.test(
      src,
    ),
    "must declare a text/plain alternate link built from buildLocalizedPath(`/tools/${slug}`, locale) + '/llms.txt'",
  );
  assert.ok(
    /<link[\s\S]*?rel="alternate"[\s\S]*?type="text\/markdown"[\s\S]*?href=\{`\$\{buildLocalizedPath\(`\/tools\/\$\{slug\}`,\s*locale\)\}\/markdown`\}/.test(
      src,
    ),
    "must declare a text/markdown alternate link built from buildLocalizedPath(`/tools/${slug}`, locale) + '/markdown'",
  );
});

test("app/(zh)/news/[id]/page.tsx declares per-article llms.txt + markdown <link> tags, gated on isGov", () => {
  const src = readSource("app", "(zh)", "news", "[id]", "page.tsx");
  assert.ok(src.includes("{isGov && ("), "the <link> tags must be gated on the same isGov flag used for the redirect");
  assert.ok(src.includes('href={`/news/${news.id}/llms.txt`}'));
  assert.ok(src.includes('href={`/news/${news.id}/markdown`}'));
});

test("app/(zh)/privacy/page.tsx declares its llms.txt + markdown <link> tags", () => {
  const src = readSource("app", "(zh)", "privacy", "page.tsx");
  assert.ok(src.includes('href="/privacy/llms.txt"'));
  assert.ok(src.includes('href="/privacy/markdown"'));
});

test("app/(zh)/accessibility/page.tsx declares its llms.txt + markdown <link> tags", () => {
  const src = readSource("app", "(zh)", "accessibility", "page.tsx");
  assert.ok(src.includes('href="/accessibility/llms.txt"'));
  assert.ok(src.includes('href="/accessibility/markdown"'));
});

test("app/(zh)/llm-info/page.tsx declares its own page-level llms.txt + markdown <link> tags (distinct from the site-wide ones)", () => {
  const src = readSource("app", "(zh)", "llm-info", "page.tsx");
  assert.ok(src.includes('href="/llm-info/llms.txt"'));
  assert.ok(src.includes('href="/llm-info/markdown"'));
});

// ---------------------------------------------------------------------------
// 6. Route files exist and are wired to the shared generator + the right adapter
// ---------------------------------------------------------------------------

const routeFiles = [
  ["app", "(zh)", "tools", "[slug]", "llms.txt", "route.ts", "buildToolLlmsPageContent", "buildLlmsTxt"],
  ["app", "(zh)", "tools", "[slug]", "markdown", "route.ts", "buildToolLlmsPageContent", "buildLlmsMarkdown"],
  ["app", "(zh)", "news", "[id]", "llms.txt", "route.ts", "buildNewsLlmsPageContent", "buildLlmsTxt"],
  ["app", "(zh)", "news", "[id]", "markdown", "route.ts", "buildNewsLlmsPageContent", "buildLlmsMarkdown"],
  ["app", "(zh)", "privacy", "llms.txt", "route.ts", "buildPrivacyLlmsPageContent", "buildLlmsTxt"],
  ["app", "(zh)", "privacy", "markdown", "route.ts", "buildPrivacyLlmsPageContent", "buildLlmsMarkdown"],
  ["app", "(zh)", "accessibility", "llms.txt", "route.ts", "buildAccessibilityLlmsPageContent", "buildLlmsTxt"],
  ["app", "(zh)", "accessibility", "markdown", "route.ts", "buildAccessibilityLlmsPageContent", "buildLlmsMarkdown"],
  ["app", "(zh)", "llm-info", "llms.txt", "route.ts", "buildLlmInfoLlmsPageContent", "buildLlmsTxt"],
  ["app", "(zh)", "llm-info", "markdown", "route.ts", "buildLlmInfoLlmsPageContent", "buildLlmsMarkdown"],
];

for (const [...pathSegments] of routeFiles) {
  const [adapterFn, generatorFn] = pathSegments.slice(-2);
  const fileSegments = pathSegments.slice(0, -2);
  test(`${fileSegments.join("/")} exists and calls ${adapterFn} + ${generatorFn}`, () => {
    const fullPath = path.join(ROOT_DIR, ...fileSegments);
    assert.ok(fs.existsSync(fullPath), `${fullPath} must exist`);
    const src = fs.readFileSync(fullPath, "utf-8");
    assert.ok(src.includes(adapterFn), `must call ${adapterFn}`);
    assert.ok(src.includes(generatorFn), `must call ${generatorFn}`);
  });
}

test("the two Content-Type headers used across all 10 routes match their declared <link> type values", () => {
  for (const segments of routeFiles) {
    const fileSegments = segments.slice(0, -2);
    const fullPath = path.join(ROOT_DIR, ...fileSegments);
    const src = fs.readFileSync(fullPath, "utf-8");
    const isLlmsTxt = fileSegments.includes("llms.txt");
    if (isLlmsTxt) {
      assert.ok(src.includes("text/plain"), `${fullPath} (llms.txt) must serve Content-Type: text/plain`);
    } else {
      assert.ok(src.includes("text/markdown"), `${fullPath} (markdown) must serve Content-Type: text/markdown`);
    }
  }
});
