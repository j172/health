import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// issue #590 (parent #583): "/tools/earthquakes" (and its en/ja/ko
// siblings) is retired in favor of "/tools/global-watch/earthquakes" — the
// item sub-route issue #588 shipped with the same data and real translated
// content. Unlike the ?tab=/?type= retirements this repo already has
// (green-shops #448, ltc-contracted #447, cpc-stations #483), earthquakes
// was itself a TRANSLATED_TOOL_SLUGS entry, so this one also needs 3
// locale-prefixed 301s, not just the zh one — see next.config.js's own
// comment on this block.

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
  load(url, context, nextLoad) {
    if (url.endsWith(".json")) {
      const source = fs.readFileSync(fileURLToPath(url), "utf8");
      return { format: "json", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const readSrc = (...segments) => fs.readFileSync(path.join(ROOT_DIR, ...segments), "utf-8");

// ---------------------------------------------------------------------------
// 1. Permanent redirects — zh + 3 locale-prefixed siblings
//
// Moved out of next.config.js's redirects() into middleware.ts / this data
// file 2026-10-15 — every permanent (308) redirect on the site was 500ing
// because next.config.js's redirects() always adds a non-standard Refresh
// header that this host's Cloudflare/LiteSpeed path can't handle. See
// tests/middleware-permanent-redirects.test.mjs for the full story and
// general coverage; these keep issue #590's specific assertions alive at
// their new location.
// ---------------------------------------------------------------------------

const { PERMANENT_REDIRECT_RULES } = await import("../lib/redirects/permanentRedirectRules.ts");

test("the redirect rules permanently send /tools/earthquakes to /tools/global-watch/earthquakes (issue #590)", () => {
  const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === "/tools/earthquakes" && !r.has);
  assert.ok(rule, "expected a redirect rule for /tools/earthquakes");
  assert.equal(rule.destination, "/tools/global-watch/earthquakes");
  assert.equal(rule.permanent, true);
});

test("the redirect rules send each of /en, /ja, /ko's /tools/earthquakes to the matching locale's global-watch item (issue #590)", () => {
  for (const locale of ["en", "ja", "ko"]) {
    const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === `/${locale}/tools/earthquakes`);
    assert.ok(rule, `expected a redirect rule for /${locale}/tools/earthquakes`);
    assert.equal(rule.destination, `/${locale}/tools/global-watch/earthquakes`);
    assert.equal(rule.permanent, true);
  }
});

test("the ?lang= redirect slug list no longer carries the retired 'earthquakes' tool slug (issue #590)", () => {
  // The ?lang= -> real-path mechanism (issue #485/#486) only makes sense for
  // slugs that still resolve to a real /tools/<slug> page; "earthquakes" no
  // longer does (its content moved to a nested sub-route), so leaving it in
  // that flat-slug list would 301 /tools/earthquakes?lang=en to the
  // now-deleted /en/tools/earthquakes instead of this ticket's own redirect.
  const langEarthquakesRule = PERMANENT_REDIRECT_RULES.find((r) => r.source === "/tools/earthquakes" && r.has);
  assert.equal(langEarthquakesRule, undefined, "the ?lang= redirect slug list must not include the retired 'earthquakes' slug");
});

// ---------------------------------------------------------------------------
// 2. Old page directories no longer exist
// ---------------------------------------------------------------------------

test("the old /tools/earthquakes page directories (zh and locale) no longer exist (issue #590)", () => {
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, "app", "(zh)", "tools", "earthquakes")),
    "app/(zh)/tools/earthquakes should be deleted, not just redirected around",
  );
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, "app", "[locale]", "tools", "earthquakes")),
    "app/[locale]/tools/earthquakes should be deleted, not just redirected around",
  );
});

test("EarthquakeContent.tsx (a shared component, not earthquakes-page-only) survives the deletion, moved to components/Tools/GlobeWatch (issue #590)", () => {
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "components", "Tools", "GlobeWatch", "EarthquakeContent.tsx")),
    "EarthquakeContent.tsx must still exist at its new shared location",
  );
});

test("GlobeWatchEarthquakesItem.tsx imports EarthquakeContent from its new colocated path, not the deleted page directory (issue #590)", () => {
  const itemSrc = readSrc("components", "Tools", "GlobeWatch", "GlobeWatchEarthquakesItem.tsx");
  assert.match(itemSrc, /import EarthquakeContent from "\.\/EarthquakeContent"/);
  assert.ok(
    !itemSrc.includes('@/app/(zh)/tools/earthquakes/EarthquakeContent'),
    "must not still import from the deleted app/(zh)/tools/earthquakes/ directory",
  );
});

// ---------------------------------------------------------------------------
// 3. catalog.ts: no earthquakes entry, global-watch entry exists,
//    relatedSlugs updated sitewide
// ---------------------------------------------------------------------------

const catalogContent = readSrc("lib", "server", "tools", "catalog.ts");

test("catalog.ts no longer defines a standalone earthquakes TOOL_CATALOG entry, and still defines global-watch (issue #590)", () => {
  assert.ok(
    !/slug:\s*"earthquakes"/.test(catalogContent),
    "catalog.ts should no longer define a TOOL_CATALOG entry with slug \"earthquakes\"",
  );
  assert.ok(
    /slug:\s*"global-watch"/.test(catalogContent),
    "catalog.ts should still (already, from #587) define the global-watch TOOL_CATALOG entry",
  );
});

test("no relatedSlugs array anywhere in catalog.ts still references the retired earthquakes slug (issue #590)", () => {
  assert.ok(
    !/relatedSlugs:\s*\[[^\]]*"earthquakes"[^\]]*\]/.test(catalogContent),
    "no relatedSlugs array in catalog.ts should still reference the retired earthquakes slug",
  );
});

test("global-watch's own relatedSlugs dropped the self-reference to earthquakes rather than renaming it to itself (issue #590)", () => {
  const match = catalogContent.match(/slug:\s*"global-watch"[\s\S]*?relatedSlugs:\s*\[([^\]]*)\]/);
  assert.ok(match, "should find the global-watch entry's relatedSlugs array");
  assert.ok(!match[1].includes("global-watch"), "global-watch must not list itself in its own relatedSlugs");
  assert.ok(
    !match[1].includes("earthquakes"),
    "global-watch's relatedSlugs should not reference the retired earthquakes slug",
  );
  // #591 (parent #583), merged alongside this ticket, also retired
  // "travel-epidemic-alerts" the same way — so global-watch's relatedSlugs
  // should no longer carry that reference either, not just earthquakes.
  assert.ok(
    !match[1].includes("travel-epidemic-alerts"),
    "global-watch's relatedSlugs should not reference the retired travel-epidemic-alerts slug (issue #591, merged alongside this one)",
  );
});

test("global-watch's keywords absorbed earthquakes' old keywords, so News<->Tools cross-linking still surfaces it for earthquake news (issue #590)", () => {
  const match = catalogContent.match(/slug:\s*"global-watch"[\s\S]*?keywords:\s*\[([^\]]*)\]/);
  assert.ok(match, "should find the global-watch entry's keywords array");
  for (const keyword of ["地震", "地震速報", "震度", "海嘯"]) {
    assert.ok(match[1].includes(keyword), `global-watch's keywords should include "${keyword}"`);
  }
});

test("the retired earthquakes slug is removed from INDEXABLE_SLUGS (issue #590)", async () => {
  const { isToolIndexable } = await import("../lib/server/tools/catalog.ts");
  assert.equal(
    isToolIndexable({ slug: "earthquakes" }),
    false,
    "isToolIndexable must not treat the retired 'earthquakes' slug as indexable",
  );
});

// ---------------------------------------------------------------------------
// 4. translatedPages.ts: earthquakes removed, global-watch item untouched
// ---------------------------------------------------------------------------

test("TRANSLATED_TOOL_SLUGS and I18N_SCOPE_PAGES no longer carry the retired earthquakes tool slug (issue #590)", async () => {
  const { TRANSLATED_TOOL_SLUGS, I18N_SCOPE_PAGES, TRANSLATED_STANDALONE_PATHS, scopeEntryPath } = await import(
    "../lib/i18n/translatedPages.ts"
  );
  assert.ok(!TRANSLATED_TOOL_SLUGS.includes("earthquakes"));
  assert.ok(!I18N_SCOPE_PAGES.some((entry) => entry.kind === "tool" && entry.slug === "earthquakes"));

  // The #588 item sub-route registration must survive untouched.
  assert.ok(TRANSLATED_STANDALONE_PATHS.map(scopeEntryPath).includes("/tools/global-watch/earthquakes"));
  assert.ok(I18N_SCOPE_PAGES.map(scopeEntryPath).includes("/tools/global-watch/earthquakes"));
});

test("app/[locale]/tools/ no longer has an earthquakes subdirectory", () => {
  const entries = fs
    .readdirSync(path.join(ROOT_DIR, "app", "[locale]", "tools"), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
  assert.ok(!entries.includes("earthquakes"));
});

// ---------------------------------------------------------------------------
// 5. Site-wide link references updated to the new path
// ---------------------------------------------------------------------------

test("HomeStatusBar and EarthquakeSidebarWidget link to the new global-watch item, not the retired flat page (issue #590)", () => {
  const homeStatusBarSrc = readSrc("components", "Home", "HomeStatusBar.tsx");
  const sidebarWidgetSrc = readSrc("components", "Tools", "EarthquakeSidebarWidget.tsx");
  assert.ok(homeStatusBarSrc.includes('"/tools/global-watch/earthquakes"'));
  assert.ok(!homeStatusBarSrc.includes('"/tools/earthquakes"'));
  assert.ok(sidebarWidgetSrc.includes('href="/tools/global-watch/earthquakes"'));
  assert.ok(!sidebarWidgetSrc.includes('href="/tools/earthquakes"'));
});

test("the /tools index page no longer lists a standalone earthquakes TOOL_ICONS entry (issue #590)", () => {
  const toolsIndexContent = readSrc("app", "(zh)", "tools", "page.tsx");
  assert.ok(!/\bearthquakes:\s*"/.test(toolsIndexContent), "TOOL_ICONS should no longer have an earthquakes key");
});

// ---------------------------------------------------------------------------
// 6. The "颱風地震來了" guide points at the new item, with real translated
//    content preserved (not a silent fallback to Chinese)
// ---------------------------------------------------------------------------

test("the typhoon-earthquake guide's earthquake step resolves to global-watch with an hrefOverride to the item sub-route (issue #590)", async () => {
  const { GUIDES, buildGuide } = await import("../lib/server/tools/navModel.ts");
  const zhGuide = GUIDES.find((g) => g.slug === "typhoon-earthquake");
  assert.ok(zhGuide, "typhoon-earthquake guide must still exist");

  const step = zhGuide.steps.find((s) => s.hrefOverride === "/tools/global-watch/earthquakes");
  assert.ok(step, "a step must declare hrefOverride pointing at the global-watch earthquakes item");
  assert.equal(step.toolSlug, "global-watch", "that step's toolSlug must resolve a real TOOL_CATALOG entry");
  assert.ok(
    !zhGuide.steps.some((s) => s.toolSlug === "earthquakes"),
    "no step should still reference the retired 'earthquakes' toolSlug",
  );

  const built = buildGuide("typhoon-earthquake");
  const builtStep = built.steps.find((s) => s.hrefOverride === "/tools/global-watch/earthquakes");
  assert.ok(builtStep, "buildGuide must resolve the step");
  assert.equal(
    builtStep.href,
    "/tools/global-watch/earthquakes",
    "buildGuide must prefer hrefOverride over the default /tools/<toolSlug> href",
  );
  assert.equal(builtStep.tool.slug, "global-watch");
});

test("lib/i18n/guideContent.ts's typhoon-earthquake translations are keyed by 'global-watch', not the retired 'earthquakes' slug (issue #590)", async () => {
  const { getLocalizedGuideMeta } = await import("../lib/i18n/guideContent.ts");
  for (const locale of ["en", "ja", "ko"]) {
    const meta = getLocalizedGuideMeta("typhoon-earthquake", locale);
    assert.ok(meta.steps["global-watch"], `${locale}: steps must be keyed by "global-watch"`);
    assert.ok(meta.steps["global-watch"].caption?.trim());
    assert.ok(meta.steps["global-watch"].why?.trim());
    assert.ok(!meta.steps.earthquakes, `${locale}: must not still have a stale "earthquakes" key`);
  }
});

test("the locale guide page resolves the earthquake step's href through isTranslatedPath + hrefOverride, landing on the item's own real translation (issue #590)", () => {
  const localeGuidePageSrc = readSrc("app", "[locale]", "guides", "typhoon-earthquake", "page.tsx");
  assert.match(localeGuidePageSrc, /isTranslatedPath/);
  assert.match(localeGuidePageSrc, /step\.hrefOverride\s*\?\?\s*`\/tools\/\$\{step\.toolSlug\}`/);
  assert.match(localeGuidePageSrc, /resolveStepHref\(step, locale\)/);
});
