import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

// issue #458: site-wide structured data declaring on-site search support
// (Schema.org WebSite + SearchAction), so Google can potentially render a
// Sitelinks search box. `buildWebSiteEntity` already existed in
// lib/server/news/seo.ts and several page-specific @graph builders
// (home/news/tools/llm-info) already called it, but nothing rendered it on
// EVERY route -- pages without their own composite @graph (e.g. /privacy,
// /accessibility, /emergency) got no JSON-LD at all. This wires
// `buildSiteGraphJsonLd` (Organization + WebSite + SiteNavigationElement)
// into app/layout.tsx, the single root layout every route nests under.
//
// lib/server/news/seo.ts has extensionless relative imports (e.g.
// "./sourceLabels") that Node's native ESM/TS loader cannot resolve outside
// a bundler, so -- matching every other test touching lib/server/news/* in
// this repo -- these assertions inspect source text rather than importing
// the module live.

const seoTsPath = path.join(ROOT_DIR, "lib", "server", "news", "seo.ts");
const seoTsContent = fs.readFileSync(seoTsPath, "utf-8");

test("lib/server/news/seo.ts: buildWebSiteEntity declares a spec-conformant SearchAction", () => {
  const match = seoTsContent.match(
    /export const buildWebSiteEntity[\s\S]*?\n\}\);/,
  );
  assert.ok(match, "buildWebSiteEntity must be defined as expected");
  const src = match[0];

  assert.ok(src.includes('"@type": "WebSite"'), "must declare @type WebSite");
  assert.ok(src.includes("`${baseUrl}/#website`"), "must declare a stable @id for @graph linking");
  assert.ok(
    src.includes('publisher: { "@id": `${baseUrl}/#organization` }'),
    "publisher must back-reference the Organization entity by @id",
  );

  assert.ok(src.includes("potentialAction"), "WebSite must declare potentialAction for Sitelinks Searchbox eligibility");
  assert.ok(src.includes('"@type": "SearchAction"'), "potentialAction must be a SearchAction");
  assert.ok(src.includes('"@type": "EntryPoint"'), "SearchAction.target must be an EntryPoint");

  // Required exact value per https://schema.org/SearchAction and Google's
  // Sitelinks Searchbox markup guide: the placeholder name in urlTemplate
  // must be search_term_string, and query-input must reference that same name.
  assert.ok(
    src.includes("{search_term_string}"),
    "target.urlTemplate must contain the literal {search_term_string} placeholder",
  );
  assert.ok(
    src.includes('"query-input": "required name=search_term_string"'),
    'query-input must be exactly "required name=search_term_string"',
  );

  // Target is a real, working, already-shipped route (see next test), not a
  // placeholder/fictional search endpoint.
  assert.ok(
    src.includes("`${baseUrl}/news?keyword={search_term_string}`"),
    "urlTemplate must point at the real /news?keyword= filter route",
  );
});

test("the SearchAction's /news?keyword= target is a real, working filter -- not decorative", () => {
  const newsPageContent = fs.readFileSync(path.join(ROOT_DIR, "app", "(zh)", "news", "page.tsx"), "utf-8");
  assert.ok(
    newsPageContent.includes("keyword: keywordParam"),
    "app/(zh)/news/page.tsx must read a `keyword` search param",
  );
  assert.ok(
    /listLatestNews\(\s*[\s\S]*?keyword/.test(newsPageContent),
    "app/(zh)/news/page.tsx must pass keyword through to the data query (real filtering, not decorative)",
  );

  const queriesContent = fs.readFileSync(path.join(ROOT_DIR, "lib", "server", "news", "queries.ts"), "utf-8");
  assert.ok(
    queriesContent.includes("KEYWORD_MATCH_SQL") && queriesContent.includes("conditions.push(KEYWORD_MATCH_SQL)"),
    "listLatestNews must apply a real keyword filter condition, not ignore the param",
  );

  // This also matches the site's own existing Ctrl+K search modal, whose
  // "view all results" link already funnels the typed query into this same
  // /news?keyword= route -- the SearchAction target isn't a new invention.
  const searchModalContent = fs.readFileSync(
    path.join(ROOT_DIR, "components", "Search", "SearchModal.tsx"),
    "utf-8",
  );
  assert.ok(
    searchModalContent.includes("/news?keyword=${encodeURIComponent(query)}"),
    "the in-app search modal's own 'view all results' link should match the SearchAction target shape",
  );
});

test("lib/server/news/seo.ts: buildSiteGraphJsonLd wires buildWebSiteEntity into an @context/@graph document", () => {
  const match = seoTsContent.match(
    /export const buildSiteGraphJsonLd[\s\S]*?\n\};/,
  );
  assert.ok(match, "buildSiteGraphJsonLd must be defined as expected");
  const src = match[0];

  assert.ok(src.includes('"@context": "https://schema.org"'), "must declare the Schema.org @context");
  assert.ok(src.includes("buildOrganizationEntity(baseUrl)"), "@graph must include the Organization entity");
  assert.ok(src.includes("buildWebSiteEntity(baseUrl)"), "@graph must include the WebSite(SearchAction) entity");
  assert.ok(src.includes("buildSiteNavigationElements(baseUrl)"), "@graph must include SiteNavigationElement entries");
});

test("app/layout.tsx (the single root layout) renders buildSiteGraphJsonLd's JSON-LD on every route", () => {
  const layoutPath = path.join(ROOT_DIR, "app", "(zh)", "layout.tsx");
  assert.ok(fs.existsSync(layoutPath), "app/layout.tsx must exist");
  const content = fs.readFileSync(layoutPath, "utf-8");

  assert.ok(
    content.includes("buildSiteGraphJsonLd") && content.includes('from "@/lib/server/news/seo"'),
    "app/layout.tsx must import buildSiteGraphJsonLd from lib/server/news/seo",
  );
  assert.ok(
    content.includes("const siteGraph = buildSiteGraphJsonLd()"),
    "app/layout.tsx must compute the site-wide @graph",
  );
  assert.ok(
    content.includes('type="application/ld+json"') && content.includes("JSON.stringify(siteGraph)"),
    "app/layout.tsx must render the @graph as a JSON-LD <script> tag",
  );

  // Every other app/**/layout.tsx must NOT declare its own <html> tag, which
  // is what guarantees app/layout.tsx is the single root layout wrapping
  // every route (so this one JSON-LD script really is site-wide, not just
  // scoped to one route group).
  const subLayouts = [
    "app/(zh)/(site)/layout.tsx",
    "app/(zh)/admin/layout.tsx",
    "app/(zh)/news/layout.tsx",
    "app/(zh)/privacy/layout.tsx",
    "app/(zh)/tools/layout.tsx",
  ];
  for (const rel of subLayouts) {
    const subPath = path.join(ROOT_DIR, rel);
    assert.ok(fs.existsSync(subPath), `${rel} must exist`);
    const subContent = fs.readFileSync(subPath, "utf-8");
    assert.ok(
      !subContent.includes("<html"),
      `${rel} must not declare its own <html> root (would make app/layout.tsx's JSON-LD non-site-wide)`,
    );
  }
});
