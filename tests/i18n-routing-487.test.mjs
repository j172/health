import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #487 (parent #438 §Q) — extends #485's /en//ja//ko/ routing mechanism
// to: 4 more /tools/<slug> pages (cool-spots, cultural-events, heritage-map,
// tourism-factories), the homepage ("/"), "/nearby", and the
// "typhoon-earthquake" life-situation guide. Covers:
//
// 1. The new TRANSLATED_TOOL_SLUGS entries have complete, non-empty en/ja/ko
//    content (the generic "every TRANSLATED_TOOL_SLUGS entry..." test in
//    tests/i18n-routing-485.test.mjs already re-validates these too, since
//    it iterates the live array — this file adds the slug-specific checks).
// 2. TRANSLATED_STANDALONE_PATHS / TRANSLATED_CANONICAL_PATHS cover "/",
//    "/nearby", "/guides/typhoon-earthquake" with reciprocal hreflang.
// 3. The typhoon-earthquake guide's en/ja/ko translation is as COMPLETE as
//    the zh version — same step count, same FAQ count, not a trimmed copy.
// 4. The matching app/[locale]/** route files exist for every one of this
//    batch's new pages.
// 5. next.config.js's ?lang= redirects cover the new tool slugs, and the
//    dangerous generic catch-all is still absent.

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

const {
  TRANSLATED_TOOL_SLUGS,
  TRANSLATED_STANDALONE_PATHS,
  TRANSLATED_CANONICAL_PATHS,
  PATH_LOCALES,
  isTranslatedPath,
  isTranslatedStandalonePath,
  buildHreflangAlternates,
  scopeEntryPath,
} = await import("../lib/i18n/translatedPages.ts");

const { getLocalizedToolMeta } = await import("../lib/i18n/toolContent.ts");
const { getLocalizedPageMeta } = await import("../lib/i18n/pageContent.ts");
const { getLocalizedGuideMeta, TRANSLATED_GUIDE_SLUGS, isTranslatedGuideSlug } = await import(
  "../lib/i18n/guideContent.ts"
);
const { GUIDES } = await import("../lib/server/tools/navModel.ts");

const NEW_TOOL_SLUGS = ["cool-spots", "cultural-events", "heritage-map", "tourism-factories"];

// ---------------------------------------------------------------------------
// 1. The 4 new tool pages
// ---------------------------------------------------------------------------

test("issue #487 adds these 4 tool slugs (containment check — sibling ticket #486 also grows this same array)", () => {
  for (const slug of NEW_TOOL_SLUGS) {
    assert.ok(TRANSLATED_TOOL_SLUGS.includes(slug), `${slug} must be in TRANSLATED_TOOL_SLUGS`);
  }
  // Not an exact-length snapshot: #486 (medical/transport/weather/disaster)
  // landed in the same window and also grows this array, so the only safe
  // assertion here is "at least the 3 pilots + this ticket's 4".
  assert.ok(TRANSLATED_TOOL_SLUGS.length >= 7, "must contain at least #485's 3 pilots + #487's 4");
});

test("app/[locale]/tools/<slug>/page.tsx exists for each of the 4 new tool slugs", () => {
  for (const slug of NEW_TOOL_SLUGS) {
    const pagePath = path.join(ROOT_DIR, "app", "[locale]", "tools", slug, "page.tsx");
    assert.ok(fs.existsSync(pagePath), `app/[locale]/tools/${slug}/page.tsx must exist`);
  }
});

// ---------------------------------------------------------------------------
// 2. Standalone (non-tool) pages registry
// ---------------------------------------------------------------------------

test("TRANSLATED_STANDALONE_PATHS covers home, nearby, and the typhoon-earthquake guide", () => {
  const paths = TRANSLATED_STANDALONE_PATHS.map(scopeEntryPath);
  // Issue #588 (parent #583) grew this registry by one more standalone path
  // (the first global-watch item sub-route) — a containment check here
  // (matching how TRANSLATED_TOOL_SLUGS's own "always contains the 3 pilot
  // pages" test is written) rather than the original point-in-time exact
  // set, so a later ticket adding its own standalone path doesn't need to
  // keep editing this specific assertion. Issue #589 added
  // "/tools/global-watch/epidemics" the same way.
  for (const expected of [
    "/",
    "/guides/typhoon-earthquake",
    "/nearby",
    "/tools/global-watch/earthquakes",
    "/tools/global-watch/epidemics",
  ]) {
    assert.ok(paths.includes(expected), `${expected} must remain in TRANSLATED_STANDALONE_PATHS`);
  }
  for (const p of paths) {
    assert.ok(isTranslatedStandalonePath(p), `${p} must report isTranslatedStandalonePath(true)`);
    assert.ok(TRANSLATED_CANONICAL_PATHS.includes(p), `${p} must be in TRANSLATED_CANONICAL_PATHS`);
    assert.ok(isTranslatedPath(p), `${p} must be isTranslatedPath(true)`);
  }
});

test("buildHreflangAlternates is reciprocal (zh-TW/en/ja/ko + x-default) for each new standalone page", () => {
  const baseUrl = "https://health.j172.tw";
  for (const canonicalPath of ["/", "/nearby", "/guides/typhoon-earthquake"]) {
    const alternates = buildHreflangAlternates(canonicalPath, baseUrl);
    assert.ok(alternates, `${canonicalPath} must get a non-null alternates set`);
    assert.equal(alternates["zh-TW"], canonicalPath === "/" ? `${baseUrl}/` : `${baseUrl}${canonicalPath}`);
    for (const locale of PATH_LOCALES) {
      assert.ok(alternates[locale]?.includes(`/${locale}`), `${canonicalPath}: ${locale} alternate must be locale-prefixed`);
    }
    assert.ok(alternates["x-default"], `${canonicalPath} must have an x-default alternate`);
  }
});

// ---------------------------------------------------------------------------
// 3. Content completeness — no empty strings, no silent zh fallback
// ---------------------------------------------------------------------------

test("the 4 new tool pages have complete, non-empty, genuinely-translated en/ja/ko content", () => {
  for (const slug of NEW_TOOL_SLUGS) {
    const zhMeta = getLocalizedToolMeta(slug, "zh-TW");
    for (const locale of PATH_LOCALES) {
      const meta = getLocalizedToolMeta(slug, locale);
      assert.ok(meta.title?.trim(), `${slug}/${locale}: title must not be empty`);
      assert.ok(meta.description?.trim(), `${slug}/${locale}: description must not be empty`);
      assert.ok(meta.directAnswer?.trim(), `${slug}/${locale}: directAnswer must not be empty`);
      assert.ok(Array.isArray(meta.faqs) && meta.faqs.length > 0, `${slug}/${locale}: must have at least one FAQ`);
      for (const faq of meta.faqs) {
        assert.ok(faq.question?.trim(), `${slug}/${locale}: FAQ question must not be empty`);
        assert.ok(faq.answer?.trim(), `${slug}/${locale}: FAQ answer must not be empty`);
      }
      assert.notEqual(meta.title, zhMeta.title, `${slug}/${locale}: title must be translated, not a zh copy`);
      assert.notEqual(meta.description, zhMeta.description, `${slug}/${locale}: description must be translated, not a zh copy`);
    }
  }
});

test("home and nearby page meta (title/description) is complete and translated for every path locale", () => {
  for (const page of ["home", "nearby"]) {
    for (const locale of PATH_LOCALES) {
      const meta = getLocalizedPageMeta(page, locale);
      assert.ok(meta.title?.trim(), `${page}/${locale}: title must not be empty`);
      assert.ok(meta.description?.trim(), `${page}/${locale}: description must not be empty`);
    }
  }
});

test("the typhoon-earthquake guide's translation is exactly as complete as the zh version — every step, not a trimmed subset", () => {
  const zhGuide = GUIDES.find((g) => g.slug === "typhoon-earthquake");
  assert.ok(zhGuide, "typhoon-earthquake must exist in GUIDES");
  assert.ok(isTranslatedGuideSlug("typhoon-earthquake"));
  assert.deepEqual([...TRANSLATED_GUIDE_SLUGS], ["typhoon-earthquake"]);

  for (const locale of PATH_LOCALES) {
    const meta = getLocalizedGuideMeta("typhoon-earthquake", locale);
    assert.ok(meta.title?.trim(), `${locale}: guide title must not be empty`);
    assert.notEqual(meta.title, zhGuide.title, `${locale}: guide title must be translated`);
    assert.ok(meta.description?.trim(), `${locale}: guide description must not be empty`);
    assert.notEqual(meta.description, zhGuide.description, `${locale}: guide description must be translated`);

    // Same step COUNT as zh — the acceptance criterion this guards is
    // specifically "not an abbreviated version".
    const translatedStepSlugs = Object.keys(meta.steps);
    assert.equal(
      translatedStepSlugs.length,
      zhGuide.steps.length,
      `${locale}: must translate all ${zhGuide.steps.length} steps, found ${translatedStepSlugs.length}`,
    );
    for (const step of zhGuide.steps) {
      const localizedStep = meta.steps[step.toolSlug];
      assert.ok(localizedStep, `${locale}: step "${step.toolSlug}" must have a translation`);
      assert.ok(localizedStep.caption?.trim(), `${locale}: step "${step.toolSlug}" caption must not be empty`);
      assert.ok(localizedStep.why?.trim(), `${locale}: step "${step.toolSlug}" why must not be empty`);
      assert.notEqual(localizedStep.caption, step.caption, `${locale}: step "${step.toolSlug}" caption must be translated`);
      assert.notEqual(localizedStep.why, step.why, `${locale}: step "${step.toolSlug}" why must be translated`);
    }

    // Same FAQ count as zh.
    assert.equal(meta.faqs.length, zhGuide.faqs.length, `${locale}: must translate all ${zhGuide.faqs.length} FAQs`);
    for (const faq of meta.faqs) {
      assert.ok(faq.question?.trim());
      assert.ok(faq.answer?.trim());
    }
  }
});

// ---------------------------------------------------------------------------
// 4. Route files exist for every new page
// ---------------------------------------------------------------------------

test("app/[locale]/page.tsx, app/[locale]/nearby/page.tsx, and the typhoon-earthquake guide route all exist", () => {
  assert.ok(fs.existsSync(path.join(ROOT_DIR, "app", "[locale]", "page.tsx")), "app/[locale]/page.tsx must exist");
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "app", "[locale]", "nearby", "page.tsx")),
    "app/[locale]/nearby/page.tsx must exist",
  );
  assert.ok(
    fs.existsSync(path.join(ROOT_DIR, "app", "[locale]", "guides", "typhoon-earthquake", "page.tsx")),
    "app/[locale]/guides/typhoon-earthquake/page.tsx must exist",
  );
  // Guardrail: no [slug] dynamic guide route — only the one real translated
  // guide gets a route, same reasoning as app/[locale]/tools/<slug> existing
  // per-slug instead of as a catch-all.
  assert.ok(
    !fs.existsSync(path.join(ROOT_DIR, "app", "[locale]", "guides", "[slug]", "page.tsx")),
    "app/[locale]/guides/[slug]/page.tsx must not exist — only typhoon-earthquake is translated so far",
  );
});

// ---------------------------------------------------------------------------
// 5. next.config.js redirects (source-text inspection)
// ---------------------------------------------------------------------------

test("next.config.js's ?lang= redirect list covers all 7 translated tool slugs", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "next.config.js"), "utf8");
  assert.match(content, /async redirects\(\)/);
  for (const slug of [...TRANSLATED_TOOL_SLUGS]) {
    assert.ok(content.includes(`"${slug}"`), `next.config.js must mention "${slug}" in its redirect list`);
  }
});

test("next.config.js still has no generic ?lang= catch-all redirect (regression guard from issue #485)", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "next.config.js"), "utf8");
  assert.ok(
    !/source:\s*"\/:path\*"[\s\S]{0,200}has:\s*\[\{\s*type:\s*"query",\s*key:\s*"lang"\s*\}\]/.test(content),
    "must not redirect every ?lang= URL to the same path — that is a self-redirect loop for every untranslated page",
  );
});
