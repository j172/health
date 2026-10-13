import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #459: category landing pages (/tools/category/[slug]), a 4th
// breadcrumb level on every tool page (首頁 / 工具 / 分類 / 工具), and
// retiring /tools's hand-rolled CATEGORIES array in favor of the shared
// buildCategoryPage/TOOL_GROUP_META model.
//
// lib/server/tools/navModel.ts and catalog.ts are plain .ts with no JSX, so
// this file dynamically imports and exercises them directly (same loader
// shim as lib/server/tools/navModel.test.mjs). ToolPageShell.tsx,
// app/tools/category/[slug]/page.tsx and app/tools/page.tsx all contain real
// JSX, which Node's native type-stripping loader cannot parse, so those are
// verified via source-text inspection instead — the established convention
// for anything JSX in this repo's `node --test` suite (see
// tests/outbound-link-coverage.test.mjs, tests/sitewide-search-structured-data-458.test.mjs).

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

const { TOOL_CATALOG, TOOL_GROUP_META } = await import(
  "../lib/server/tools/catalog.ts"
);
const { buildCategoryPage, getToolCategoryLink } = await import(
  "../lib/server/tools/navModel.ts"
);

// ---------------------------------------------------------------------------
// buildCategoryPage: every tool appears in exactly one category page, once
// ---------------------------------------------------------------------------

test("every tool appears exactly once across the 7 category pages' derived tool lists", () => {
  assert.equal(TOOL_GROUP_META.length, 7, "there must be exactly 7 categories");

  const occurrences = new Map();
  for (const meta of TOOL_GROUP_META) {
    const page = buildCategoryPage(meta.group);
    assert.ok(page, `buildCategoryPage(${meta.group}) must not be null`);
    for (const tool of page.tools) {
      occurrences.set(tool.slug, (occurrences.get(tool.slug) ?? 0) + 1);
    }
  }

  const catalogSlugs = TOOL_CATALOG.map((t) => t.slug);
  assert.equal(
    occurrences.size,
    catalogSlugs.length,
    `expected ${catalogSlugs.length} distinct tools across all category pages, got ${occurrences.size}`,
  );

  for (const slug of catalogSlugs) {
    assert.equal(
      occurrences.get(slug),
      1,
      `tool "${slug}" should appear exactly once across the 7 category pages, appeared ${occurrences.get(slug) ?? 0} times`,
    );
  }
});

test("buildCategoryPage returns a non-null model for all 7 valid group slugs, null for an invalid one", () => {
  for (const meta of TOOL_GROUP_META) {
    assert.ok(buildCategoryPage(meta.group) !== null, `"${meta.group}" should resolve`);
  }
  assert.equal(buildCategoryPage("not-a-real-group"), null);
  assert.equal(buildCategoryPage(""), null);
});

// ---------------------------------------------------------------------------
// getToolCategoryLink: the shared breadcrumb lookup
// ---------------------------------------------------------------------------

test("getToolCategoryLink resolves every TOOL_GROUP_META group to its label + /tools/category/<slug> href", () => {
  for (const meta of TOOL_GROUP_META) {
    const link = getToolCategoryLink(meta.group);
    assert.equal(link.group, meta.group);
    assert.equal(link.label, meta.labelDefault);
    assert.equal(link.href, `/tools/category/${meta.group}`);
  }
});

test("getToolCategoryLink throws on an unknown group instead of silently mis-rendering a breadcrumb", () => {
  assert.throws(() => getToolCategoryLink("not-a-real-group"));
});

test("every real TOOL_CATALOG entry's group resolves via getToolCategoryLink", () => {
  for (const tool of TOOL_CATALOG) {
    assert.doesNotThrow(
      () => getToolCategoryLink(tool.group),
      `tool "${tool.slug}" has group "${tool.group}", which getToolCategoryLink can't resolve`,
    );
  }
});

// ---------------------------------------------------------------------------
// Visual breadcrumb (ToolPageShell.tsx) — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const toolPageShellPath = path.join(ROOT_DIR, "components", "Tools", "ToolPageShell.tsx");
const toolPageShellContent = fs.readFileSync(toolPageShellPath, "utf-8");

test("ToolPageShell.tsx resolves the category breadcrumb level via the shared getToolCategoryLink helper", () => {
  assert.ok(
    /import\s*{[^}]*\bgetToolCategoryLink\b[^}]*}\s*from\s*"@\/lib\/server\/tools\/navModel"/.test(
      toolPageShellContent,
    ),
    "ToolPageShell.tsx must import getToolCategoryLink from lib/server/tools/navModel",
  );
  assert.ok(
    toolPageShellContent.includes("getToolCategoryLink(catalogEntry.group)"),
    "ToolPageShell.tsx must call getToolCategoryLink(catalogEntry.group) to resolve the tool's category",
  );
});

test("ToolPageShell.tsx's breadcrumb nav renders 4 levels: 首頁 / 工具 / {分類} / {title}", () => {
  const match = toolPageShellContent.match(
    /aria-label="breadcrumb">[\s\S]*?<\/nav>/,
  );
  assert.ok(match, "breadcrumb <nav> block must exist");
  const nav = match[0];

  assert.ok(nav.includes("首頁"), "level 1 must be 首頁");
  assert.ok(nav.includes('href="/"'), "level 1 must link to /");

  assert.ok(nav.includes('href="/tools"'), "level 2 must link to /tools");
  assert.ok(nav.includes("工具"), "level 2 label must be 工具");

  assert.ok(
    nav.includes("categoryLink.href") && nav.includes("categoryLink.label"),
    "a 3rd level must render categoryLink.href/categoryLink.label (the inserted category level)",
  );

  assert.ok(
    nav.includes("{title}") && nav.includes('aria-current="page"'),
    "the final level must still render the tool's own title as the current page",
  );
});

// ---------------------------------------------------------------------------
// JSON-LD breadcrumb (lib/server/news/seo.ts) — source-text inspection
// ---------------------------------------------------------------------------

const seoTsPath = path.join(ROOT_DIR, "lib", "server", "news", "seo.ts");
const seoTsContent = fs.readFileSync(seoTsPath, "utf-8");

test("buildToolGraphJsonLd's BreadcrumbList has 4 ListItems, position 3 from getToolCategoryLink, position 4 the tool", () => {
  const match = seoTsContent.match(
    /export const buildToolGraphJsonLd[\s\S]*?\n\};/,
  );
  assert.ok(match, "buildToolGraphJsonLd must be defined as expected");
  const src = match[0];

  assert.ok(
    src.includes("getToolCategoryLink(tool.group)"),
    "buildToolGraphJsonLd must resolve the category breadcrumb level via the shared getToolCategoryLink helper, not a hand-duplicated string",
  );
  assert.ok(src.includes('position: 1, name: "首頁"'));
  assert.ok(src.includes('position: 2, name: "工具"'));
  assert.ok(
    src.includes("position: 3, name: categoryLink.label"),
    "position 3 must be the category, sourced from categoryLink",
  );
  assert.ok(
    src.includes("position: 4, name: tool.title"),
    "position 4 must be the tool itself (shifted from 3 to make room for the category level)",
  );
});

test("buildCategoryPageGraphJsonLd exists with a 3-level BreadcrumbList, a CollectionPage, and an ItemList of the category's tools", () => {
  const match = seoTsContent.match(
    /export const buildCategoryPageGraphJsonLd[\s\S]*?\n\};/,
  );
  assert.ok(match, "buildCategoryPageGraphJsonLd must be defined");
  const src = match[0];

  assert.ok(src.includes('"@type": "BreadcrumbList"'));
  assert.ok(src.includes('position: 1, name: "首頁"'));
  assert.ok(src.includes('position: 2, name: "工具"'));
  assert.ok(
    src.includes("position: 3, name: category.label"),
    "the category page's breadcrumb must end at the category itself (3 levels, no further nesting)",
  );
  assert.ok(!src.includes("position: 4"), "a category page's own breadcrumb must not have a 4th level");

  assert.ok(src.includes('"@type": "CollectionPage"'));
  assert.ok(src.includes('"@type": "ItemList"'));
  assert.ok(
    src.includes("category.tools.map"),
    "the ItemList must enumerate category.tools",
  );
});

// ---------------------------------------------------------------------------
// app/tools/category/[slug]/page.tsx — source-text inspection (JSX)
// ---------------------------------------------------------------------------

const categoryPagePath = path.join(ROOT_DIR, "app", "(zh)", "tools", "category", "[slug]", "page.tsx");

test("app/(zh)/tools/category/[slug]/page.tsx exists and is wired to buildCategoryPage + notFound()", () => {
  assert.ok(fs.existsSync(categoryPagePath), "the category landing page route must exist");
  const content = fs.readFileSync(categoryPagePath, "utf-8");

  assert.ok(
    content.includes('from "@/lib/server/tools/navModel"') && content.includes("buildCategoryPage"),
    "must derive its data from the shared buildCategoryPage model",
  );
  assert.ok(
    content.includes("notFound()"),
    "must call Next's notFound() when buildCategoryPage returns null",
  );
  assert.ok(
    content.includes("generateStaticParams"),
    "must declare generateStaticParams for the 7 known category slugs",
  );
  assert.ok(
    content.includes("TOOL_GROUP_META.map"),
    "generateStaticParams should enumerate TOOL_GROUP_META's groups, not a hardcoded list",
  );
  assert.ok(
    content.includes("buildCategoryPageGraphJsonLd"),
    "must render the category page's structured data via buildCategoryPageGraphJsonLd",
  );
});

// ---------------------------------------------------------------------------
// app/tools/page.tsx — the hand-rolled CATEGORIES array must be gone
// ---------------------------------------------------------------------------

const toolsIndexPath = path.join(ROOT_DIR, "app", "(zh)", "tools", "page.tsx");
const toolsIndexContent = fs.readFileSync(toolsIndexPath, "utf-8");

test("app/(zh)/tools/page.tsx no longer declares its own hand-rolled CATEGORIES array or ToolCategory type", () => {
  assert.ok(
    !/const\s+CATEGORIES\s*:/.test(toolsIndexContent),
    "the old `const CATEGORIES: ToolCategory[] = [...]` array must be removed",
  );
  assert.ok(
    !/interface\s+ToolCategory\s*{/.test(toolsIndexContent),
    "the old `interface ToolCategory { ... }` type must be removed",
  );
  // A few of the old hand-rolled category ids/titles that have no other
  // legitimate reason to appear in this file now.
  for (const staleId of [
    'id: "body"',
    'id: "cardio"',
    'id: "care-facility"',
    'id: "child-welfare"',
    'id: "disaster-safety"',
    'id: "transport-energy"',
    'id: "life-services"',
    'id: "other"',
  ]) {
    assert.ok(
      !toolsIndexContent.includes(staleId),
      `stale hand-rolled category id "${staleId}" must be gone from app/tools/page.tsx`,
    );
  }
  assert.ok(
    !toolsIndexContent.includes("其他工具"),
    "the old leftover/catch-all '其他工具' section must be gone (every tool now belongs to one of the 7 real groups)",
  );
});

test("app/(zh)/tools/page.tsx derives its category sections from the shared navModel instead", () => {
  assert.ok(
    toolsIndexContent.includes('from "@/lib/server/tools/navModel"') &&
      toolsIndexContent.includes("buildCategoryPage"),
    "must import and call buildCategoryPage from lib/server/tools/navModel",
  );
  assert.ok(
    toolsIndexContent.includes("TOOL_GROUP_META.map"),
    "SECTIONS must be derived by mapping over TOOL_GROUP_META, not a local array",
  );
  assert.ok(
    /href={`\/tools\/category\/\$\{category\.group\}`}/.test(toolsIndexContent),
    "each category's section header must link to its /tools/category/[slug] landing page",
  );
});
