import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #465: `/guides` index page + 5 `/guides/[slug]` life-situation hub
// pages, each step linking to a real tool with a "why this step"
// explanation, a HowTo+ItemList+FAQPage JSON-LD graph (issue #438 §R), and
// per-guide llms.txt/markdown routes (issue #444's established convention).
// Also covers the reverse-lookup helper `getGuidesForTool` (acceptance
// criterion 5 — data only, no tool-page UI yet, per issue #438 §A).
//
// lib/server/tools/navModel.ts and lib/server/content/*.ts are plain .ts
// with no JSX, so this file dynamically imports and exercises them directly
// (same loader shim as lib/server/tools/navModel.test.mjs and
// tests/llms-pages-444.test.mjs). lib/server/news/seo.ts has extensionless
// relative imports that Node's native loader cannot resolve outside a
// bundler, so — matching every other test touching lib/server/news/* in
// this repo (see tests/tools-category-pages-459.test.mjs,
// tests/sitewide-search-structured-data-458.test.mjs) — its additions are
// verified via source-text inspection instead. The 2 page components and 2
// route.ts files are also verified via source-text inspection (real JSX /
// Next.js route conventions Node's type-stripping loader can't exercise
// directly).

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
});

const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
const { GUIDES, buildGuide, getGuidesForTool } = await import(
  "../lib/server/tools/navModel.ts"
);
const { buildLlmsTxt, buildLlmsMarkdown } = await import(
  "../lib/server/content/llmsPage.ts"
);
const { buildGuideLlmsPageContent } = await import(
  "../lib/server/content/guideLlmsPage.ts"
);

const BASE_URL = "https://health.j172.tw";

// ---------------------------------------------------------------------------
// 1. getGuidesForTool: the reverse-lookup data (AC 5)
// ---------------------------------------------------------------------------

test("getGuidesForTool finds every guide that includes a given tool as a step", () => {
  // "accessible-transit" is a step in both "caring-for-elders" and
  // "disability-living" per the GUIDES content in navModel.ts.
  const guides = getGuidesForTool("accessible-transit");
  assert.deepEqual(
    guides.map((g) => g.slug).sort(),
    ["caring-for-elders", "disability-living"],
  );
  for (const g of guides) {
    assert.equal(g.href, `/guides/${g.slug}`);
    assert.ok(g.title, `guide "${g.slug}" must have a title`);
  }
});

test("getGuidesForTool returns [] for a tool that belongs to no guide, and for an unknown slug", () => {
  const toolInNoGuide = TOOL_CATALOG.find(
    (tool) => !GUIDES.some((g) => g.steps.some((s) => s.toolSlug === tool.slug)),
  );
  assert.ok(toolInNoGuide, "at least one tool must belong to no guide, to exercise this case");
  assert.deepEqual(getGuidesForTool(toolInNoGuide.slug), []);
  assert.deepEqual(getGuidesForTool("not-a-real-tool-slug"), []);
});

test("getGuidesForTool is consistent with GUIDES: every guide's every step resolves back to that guide", () => {
  for (const guide of GUIDES) {
    for (const step of guide.steps) {
      const found = getGuidesForTool(step.toolSlug);
      assert.ok(
        found.some((g) => g.slug === guide.slug),
        `getGuidesForTool("${step.toolSlug}") must include guide "${guide.slug}"`,
      );
    }
  }
});

// ---------------------------------------------------------------------------
// 2. buildGuideLlmsPageContent + buildLlmsTxt/buildLlmsMarkdown (AC 4)
// ---------------------------------------------------------------------------

test("buildGuideLlmsPageContent is derived from the live buildGuide() model, not a re-derivation", () => {
  for (const guideMeta of GUIDES) {
    const guide = buildGuide(guideMeta.slug);
    const content = buildGuideLlmsPageContent(guide, BASE_URL);
    assert.equal(content.title, guide.title);
    assert.equal(content.summary, guide.description);
    assert.equal(content.faqs, guide.faqs);
    assert.equal(content.url, `${BASE_URL}/guides/${guide.slug}`);
    assert.equal(content.related.length, guide.steps.length);
    for (const [index, link] of content.related.entries()) {
      assert.ok(link.url.startsWith(`${BASE_URL}/tools/`));
      assert.equal(link.url, `${BASE_URL}${guide.steps[index].href}`);
    }
  }
});

test("buildLlmsTxt produces valid llms.txt grammar for a representative guide hub", () => {
  const guide = buildGuide("typhoon-earthquake");
  const content = buildGuideLlmsPageContent(guide, BASE_URL);
  const text = buildLlmsTxt(content);

  assert.ok(text.startsWith(`# ${guide.title}\n`), "must start with an H1 title line");
  assert.ok(text.includes(`\n> ${guide.description}\n`), "must have a one-line blockquote summary");
  assert.ok(text.includes("## 相關頁面 (Related Pages)"), "guide steps surface as related pages");
  assert.ok(text.includes("## 常見問題 (FAQ)"), "must have an FAQ section");

  const linkUrls = [...text.matchAll(/\]\((https?:\/\/[^)]*|[^)]*)\)/g)].map((m) => m[1]);
  assert.ok(linkUrls.length > 0, "must contain at least one link");
  for (const url of linkUrls) {
    assert.ok(/^https?:\/\//.test(url), `link "${url}" must be a full absolute URL`);
  }
});

test("buildLlmsMarkdown renders the guide's ordered steps and excludes nav/footer/script markup", () => {
  const guide = buildGuide("pregnancy-to-parenting");
  const content = buildGuideLlmsPageContent(guide, BASE_URL);
  const markdown = buildLlmsMarkdown(content);

  assert.ok(markdown.startsWith(`# ${guide.title}\n`));
  assert.ok(markdown.includes("## 情境步驟 (Guide Steps)"));
  for (const step of guide.steps) {
    assert.ok(markdown.includes(step.caption), `markdown must include step caption "${step.caption}"`);
    assert.ok(markdown.includes(step.why), `markdown must include step "why" text for "${step.toolSlug}"`);
  }
  for (const forbidden of ["<nav", "<footer", "<script", "<header", "StabloHeader", "StabloFooter"]) {
    assert.ok(!markdown.includes(forbidden), `markdown must not contain "${forbidden}"`);
  }
});

// ---------------------------------------------------------------------------
// 3. app/guides/page.tsx — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const readSource = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

test("app/(zh)/guides/page.tsx exists, lists all 5 GUIDES as cards linking to their hub page", () => {
  const indexPath = path.join(ROOT_DIR, "app", "(zh)", "guides", "page.tsx");
  assert.ok(fs.existsSync(indexPath), "app/(zh)/guides/page.tsx must exist");
  const src = readSource("app", "(zh)", "guides", "page.tsx");

  assert.ok(
    /import\s*{[^}]*\bGUIDES\b[^}]*}\s*from\s*"@\/lib\/server\/tools\/navModel"/.test(src),
    "must import GUIDES from lib/server/tools/navModel",
  );
  assert.ok(src.includes("GUIDES.map"), "must render a card per GUIDES entry");
  assert.ok(
    /href={`\/guides\/\$\{guide\.slug\}`}/.test(src),
    "each card must link to /guides/<slug>",
  );
  assert.ok(src.includes("guide.title") && src.includes("guide.description"));
});

test("app/(zh)/guides/page.tsx renders structured data via buildGuidesIndexGraphJsonLd", () => {
  const src = readSource("app", "(zh)", "guides", "page.tsx");
  assert.ok(
    src.includes("buildGuidesIndexGraphJsonLd") && src.includes('"application/ld+json"'),
    "must render a JSON-LD <script> built via buildGuidesIndexGraphJsonLd",
  );
});

// ---------------------------------------------------------------------------
// 4. app/guides/[slug]/page.tsx — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const hubPagePath = path.join(ROOT_DIR, "app", "(zh)", "guides", "[slug]", "page.tsx");

test("app/(zh)/guides/[slug]/page.tsx exists and is wired to buildGuide + notFound()", () => {
  assert.ok(fs.existsSync(hubPagePath), "the guide hub page route must exist");
  const src = fs.readFileSync(hubPagePath, "utf-8");

  assert.ok(
    src.includes('from "@/lib/server/tools/navModel"') && src.includes("buildGuide"),
    "must derive its data from the shared buildGuide model",
  );
  assert.ok(src.includes("notFound()"), "must call Next's notFound() when buildGuide returns null");
  assert.ok(src.includes("generateStaticParams"), "must declare generateStaticParams for the 5 known guide slugs");
  assert.ok(src.includes("GUIDES.map"), "generateStaticParams should enumerate GUIDES, not a hardcoded list");
  assert.ok(
    src.includes("buildGuideGraphJsonLd"),
    "must render the guide hub page's structured data via buildGuideGraphJsonLd",
  );
});

test("app/(zh)/guides/[slug]/page.tsx renders every step in order, linking to the step's real tool page with a 'why' explanation", () => {
  const src = fs.readFileSync(hubPagePath, "utf-8");
  assert.ok(src.includes("guide.steps.map"), "must map over guide.steps to render each step");
  assert.ok(src.includes("href={step.href}"), "each step card must link to the step's resolved tool href");
  assert.ok(src.includes("{step.caption}"), "must render the step's caption as the card title");
  assert.ok(src.includes("{step.why}"), "must render the step's why-this-step explanation");
});

test("app/(zh)/guides/[slug]/page.tsx renders a FAQ section from guide.faqs", () => {
  const src = fs.readFileSync(hubPagePath, "utf-8");
  assert.ok(src.includes("guide.faqs.map"), "must map over guide.faqs to render the FAQ section");
  assert.ok(src.includes("faq.question") && src.includes("faq.answer"));
});

test("app/(zh)/guides/[slug]/page.tsx declares its own per-guide llms.txt + markdown <link> tags", () => {
  const src = fs.readFileSync(hubPagePath, "utf-8");
  assert.ok(
    /<link\s+rel="alternate"\s+type="text\/plain"[^/]*href=\{`\/guides\/\$\{guide\.slug\}\/llms\.txt`\}/.test(src),
    "must declare a text/plain alternate link to this guide's own llms.txt",
  );
  assert.ok(
    /<link\s+rel="alternate"\s+type="text\/markdown"[^/]*href=\{`\/guides\/\$\{guide\.slug\}\/markdown`\}/.test(src),
    "must declare a text/markdown alternate link to this guide's own markdown route",
  );
});

// ---------------------------------------------------------------------------
// 5. app/guides/[slug]/llms.txt + markdown route.ts — exist and wire the
//    shared generator + the guide adapter
// ---------------------------------------------------------------------------

const routeFiles = [
  ["app", "(zh)", "guides", "[slug]", "llms.txt", "route.ts", "buildGuideLlmsPageContent", "buildLlmsTxt", "text/plain"],
  ["app", "(zh)", "guides", "[slug]", "markdown", "route.ts", "buildGuideLlmsPageContent", "buildLlmsMarkdown", "text/markdown"],
];

for (const [...pathSegments] of routeFiles) {
  const [adapterFn, generatorFn, contentType] = pathSegments.slice(-3);
  const fileSegments = pathSegments.slice(0, -3);
  test(`${fileSegments.join("/")} exists and calls ${adapterFn} + ${generatorFn}`, () => {
    const fullPath = path.join(ROOT_DIR, ...fileSegments);
    assert.ok(fs.existsSync(fullPath), `${fullPath} must exist`);
    const src = fs.readFileSync(fullPath, "utf-8");
    assert.ok(src.includes(adapterFn), `must call ${adapterFn}`);
    assert.ok(src.includes(generatorFn), `must call ${generatorFn}`);
    assert.ok(src.includes(contentType), `must serve Content-Type: ${contentType}`);
  });
}

// ---------------------------------------------------------------------------
// 6. lib/server/news/seo.ts — buildGuideGraphJsonLd / buildGuidesIndexGraphJsonLd
//    (source-text inspection, matching every other test touching this file)
// ---------------------------------------------------------------------------

const seoTsPath = path.join(ROOT_DIR, "lib", "server", "news", "seo.ts");
const seoTsContent = fs.readFileSync(seoTsPath, "utf-8");

test("buildGuideGraphJsonLd exists with a 3-level BreadcrumbList (首頁/生活情境/guide), a HowTo, an ItemList, and a FAQPage", () => {
  const match = seoTsContent.match(/export const buildGuideGraphJsonLd[\s\S]*?\n};/);
  assert.ok(match, "buildGuideGraphJsonLd must be defined as expected");
  const src = match[0];

  assert.ok(src.includes('"@type": "BreadcrumbList"'));
  assert.ok(src.includes('position: 1, name: "首頁"'));
  assert.ok(
    src.includes('position: 2, name: "生活情境"'),
    "breadcrumb level 2 must be 生活情境 (the /guides index)",
  );
  assert.ok(
    src.includes("position: 3, name: guide.title"),
    "breadcrumb level 3 must be the guide itself",
  );
  assert.ok(!src.includes("position: 4"), "a guide hub page's breadcrumb must not have a 4th level");

  assert.ok(src.includes('"@type": "HowTo"'), "must declare a HowTo entity for the ordered steps");
  assert.ok(src.includes('"@type": "HowToStep"'), "HowTo.step entries must be HowToStep");
  assert.ok(src.includes("guide.steps.map"), "HowTo steps must be derived from guide.steps");

  assert.ok(src.includes('"@type": "ItemList"'), "must also declare an ItemList of the guide's steps/tools");

  assert.ok(
    src.includes('"@type": "FAQPage"') && src.includes("guide.faqs.length > 0"),
    "must declare a guarded FAQPage built from guide.faqs, matching buildToolGraphJsonLd's tool.faqs.length > 0 guard",
  );
});

test("buildGuidesIndexGraphJsonLd exists with a 2-level BreadcrumbList and an ItemList of all 5 guides", () => {
  const match = seoTsContent.match(/export const buildGuidesIndexGraphJsonLd[\s\S]*?\n};/);
  assert.ok(match, "buildGuidesIndexGraphJsonLd must be defined");
  const src = match[0];

  assert.ok(src.includes('"@type": "BreadcrumbList"'));
  assert.ok(src.includes('position: 1, name: "首頁"'));
  assert.ok(src.includes('position: 2, name: "生活情境"'));
  assert.ok(src.includes('"@type": "ItemList"'));
  assert.ok(src.includes("guides.map"), "the ItemList must enumerate the passed-in guides");
});
