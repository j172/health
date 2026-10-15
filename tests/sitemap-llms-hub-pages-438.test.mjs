import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #438 §R closing sentence: "`/llms.txt`、`/llms-full.txt`、sitemap 一併
// 納入外語版與新頁面類型". The hub pages the 2.0 information architecture added
// around the tools (7 `/tools/category/<group>` pages, the `/guides` index +
// 6 guide pages, `/nearby`) and the real `/en/` `/ja/` `/ko/` translated pages
// must all be reachable from the sitemap and both AI indexes, and the old
// `?lang=en|ja|ko` links (which now 301) must be gone.
//
// app/sitemap.ts and the two llms route handlers are plain .ts with no JSX, so
// this file runs the *real* `sitemap()` / `GET()` against a stubbed news
// query module (the only DB-touching import) instead of just grepping source.
// The shared line builders in lib/server/content/sitewideLlmsIndex.ts are
// exercised through those same routes.

const REPO_ROOT = new URL("../", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    // The only DB-backed import in the three entry points under test: swap in
    // empty news lists so sitemap()/GET() run without a database.
    if (specifier === "@/lib/server/news/queries") {
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            "export const listNewsForSitemap = async () => [];" +
              "export const listRecentNewsForLlms = async () => [];",
          ),
        shortCircuit: true,
      };
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
  // lib/i18n/dictionary.ts imports locale .json files via resolveJsonModule;
  // plain `node --test` needs the import attribute for the default JSON load
  // path, so intercept .json and return it directly (same hook as
  // tests/llms-pages-444.test.mjs).
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const { default: sitemap } = await import("../app/sitemap.ts");
const { GET: getLlmsTxt } = await import("../app/llms.txt/route.ts");
const { GET: getLlmsFullTxt } = await import("../app/llms-full.txt/route.ts");
const { getBaseUrl } = await import("../lib/server/news/seo.ts");
const { TOOL_CATALOG, TOOL_GROUP_META } = await import("../lib/server/tools/catalog.ts");
const { GUIDES, getToolCategoryLink } = await import("../lib/server/tools/navModel.ts");
const { PATH_LOCALES, TRANSLATED_PAGES, TRANSLATED_CANONICAL_PATHS, buildLocalizedPath } = await import(
  "../lib/i18n/translatedPages.ts"
);

const BASE_URL = getBaseUrl();
const sitemapEntries = await sitemap();
const sitemapUrls = sitemapEntries.map((entry) => entry.url);
const llmsTxt = await (await getLlmsTxt()).text();
const llmsFullTxt = await (await getLlmsFullTxt()).text();

const categoryUrls = TOOL_GROUP_META.map((meta) => `${BASE_URL}${getToolCategoryLink(meta.group).href}`);
const guideUrls = GUIDES.map((guide) => `${BASE_URL}/guides/${guide.slug}`);

// ---------------------------------------------------------------------------
// 1. sitemap
// ---------------------------------------------------------------------------

test("sitemap lists all 7 /tools/category/<group> hub pages", () => {
  assert.equal(categoryUrls.length, TOOL_GROUP_META.length);
  assert.ok(categoryUrls.length >= 7, "expected the 7 post-#442 tool groups");
  for (const url of categoryUrls) {
    assert.ok(sitemapUrls.includes(url), `sitemap must list ${url}`);
  }
});

test("sitemap lists the /guides index and every /guides/<slug> hub page", () => {
  assert.ok(sitemapUrls.includes(`${BASE_URL}/guides`), "sitemap must list the /guides index");
  assert.ok(guideUrls.length >= 6, "expected the 6 life-situation guides");
  for (const url of guideUrls) {
    assert.ok(sitemapUrls.includes(url), `sitemap must list ${url}`);
  }
});

test("sitemap lists the zh /nearby page (not only its /en /ja /ko siblings) and /accessibility", () => {
  assert.ok(sitemapUrls.includes(`${BASE_URL}/nearby`), "sitemap must list the zh /nearby page");
  for (const locale of PATH_LOCALES) {
    assert.ok(
      sitemapUrls.includes(`${BASE_URL}/${locale}/nearby`),
      `sitemap must still list /${locale}/nearby`,
    );
  }
  assert.ok(sitemapUrls.includes(`${BASE_URL}/accessibility`), "sitemap must list /accessibility");
});

test("translated hubs and the zh home declare reciprocal hreflang alternates in the sitemap", () => {
  const byUrl = new Map(sitemapEntries.map((entry) => [entry.url, entry]));
  for (const path of ["/nearby", "/guides/typhoon-earthquake"]) {
    const entry = byUrl.get(`${BASE_URL}${path}`);
    assert.ok(entry, `${path} must be in the sitemap`);
    const languages = entry.alternates?.languages;
    assert.ok(languages, `${path} must carry alternates`);
    for (const locale of PATH_LOCALES) {
      assert.equal(languages[locale], `${BASE_URL}${buildLocalizedPath(path, locale)}`);
    }
    assert.equal(languages["x-default"], `${BASE_URL}${path}`);
  }

  const home = byUrl.get(BASE_URL);
  assert.ok(home, "zh home must be in the sitemap");
  for (const locale of PATH_LOCALES) {
    assert.equal(home.alternates?.languages?.[locale], `${BASE_URL}/${locale}`);
  }

  // A hub with no translation must not invent alternates.
  const untranslated = byUrl.get(`${BASE_URL}/guides`);
  assert.ok(untranslated);
  assert.equal(untranslated.alternates, undefined, "/guides has no /en version, so no alternates");
});

test("sitemap has no duplicate URLs and no stale ?lang= URLs", () => {
  assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, "every sitemap URL must be unique");
  for (const url of sitemapUrls) {
    assert.ok(!url.includes("?lang="), `${url} must not be a ?lang= URL`);
  }
});

// ---------------------------------------------------------------------------
// 2. llms.txt + llms-full.txt (same URL expectations, both indexes)
// ---------------------------------------------------------------------------

const INDEXES = [
  ["llms.txt", llmsTxt],
  ["llms-full.txt", llmsFullTxt],
];

for (const [name, text] of INDEXES) {
  test(`${name}: stale ?lang= links are gone and the real /en /ja /ko homes are linked`, () => {
    assert.ok(!text.includes("?lang="), `${name} must not link any ?lang= URL`);
    for (const locale of PATH_LOCALES) {
      assert.ok(text.includes(`](${BASE_URL}/${locale})`), `${name} must link ${BASE_URL}/${locale}`);
    }
  });

  test(`${name}: tool count in the heading is the real catalog size, not a hardcoded "30+ 款"`, () => {
    assert.ok(!/30\+\s*款/.test(text), `${name} must not hardcode "30+ 款"`);
    assert.ok(
      text.includes(`## ${TOOL_CATALOG.length} 款`),
      `${name} must state the real tool count (${TOOL_CATALOG.length})`,
    );
  });

  test(`${name}: lists every category hub, every guide, the guides index and /nearby`, () => {
    for (const url of [...categoryUrls, ...guideUrls, `${BASE_URL}/guides`, `${BASE_URL}/nearby`]) {
      assert.ok(text.includes(url), `${name} must mention ${url}`);
    }
    for (const meta of TOOL_GROUP_META) {
      assert.ok(text.includes(meta.labelDefault), `${name} must mention the "${meta.labelDefault}" category`);
    }
    for (const guide of GUIDES) {
      assert.ok(text.includes(guide.title), `${name} must mention the "${guide.title}" guide`);
    }
  });

  test(`${name}: every translated page is listed with its real /en /ja /ko URLs`, () => {
    assert.ok(TRANSLATED_PAGES.length > 0);
    for (const canonicalPath of TRANSLATED_CANONICAL_PATHS) {
      for (const locale of PATH_LOCALES) {
        const url = `${BASE_URL}${buildLocalizedPath(canonicalPath, locale)}`;
        assert.ok(text.includes(`](${url})`), `${name} must link ${url}`);
      }
    }
  });

  test(`${name}: still lists every tool page`, () => {
    for (const tool of TOOL_CATALOG) {
      assert.ok(text.includes(`${BASE_URL}/tools/${tool.slug}`), `${name} must still list /tools/${tool.slug}`);
    }
  });
}

test("llms.txt keeps llmstxt.org grammar: H1, blockquote, and only absolute-URL links", () => {
  const lines = llmsTxt.split("\n");
  assert.ok(lines[0].startsWith("# "), "must start with an H1");
  assert.ok(lines.some((line) => line.startsWith("> ")), "must have a blockquote summary");
  for (const heading of ["## 工具分類 (Tool Categories)", "## 生活情境指南 (Life-Situation Guides)", "## 我附近 (Nearby)"]) {
    assert.ok(lines.includes(heading), `llms.txt must have the "${heading}" section`);
  }
  const hrefs = [...llmsTxt.matchAll(/\]\(([^)]*)\)/g)].map((match) => match[1]);
  assert.ok(hrefs.length > 0);
  for (const href of hrefs) {
    assert.ok(/^https?:\/\//.test(href), `link "${href}" must be an absolute URL`);
  }
});

test("llms-full.txt spells out each guide's ordered steps and each category's member tools", () => {
  for (const guide of GUIDES) {
    assert.ok(llmsFullTxt.includes(`### ${guide.title}`), `llms-full must have a "${guide.title}" block`);
    for (const step of guide.steps) {
      assert.ok(llmsFullTxt.includes(step.caption), `llms-full must include the step "${step.caption}"`);
    }
  }
  for (const meta of TOOL_GROUP_META) {
    const members = TOOL_CATALOG.filter((tool) => tool.group === meta.group);
    assert.ok(members.length > 0);
    assert.ok(
      llmsFullTxt.includes(`- 收錄工具 (${members.length}):`),
      `llms-full must report ${members.length} tools for "${meta.labelDefault}"`,
    );
  }
  assert.ok(llmsFullTxt.includes("### 我附近：一次定位看全部急用點位"), "llms-full must describe /nearby");
});

test("neither llms route source reintroduces ?lang= links or a hardcoded tool count", () => {
  for (const file of ["app/llms.txt/route.ts", "app/llms-full.txt/route.ts"]) {
    const src = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.ok(!src.includes("?lang="), `${file} must not link ?lang= URLs (they 301 to /en /ja /ko now)`);
    assert.ok(!/30\+\s*款/.test(src), `${file} must not hardcode a tool count`);
  }
});
