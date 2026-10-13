import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #485 (parent #438 §Q) — the foundational /en/ /ja/ /ko/ routing
// ticket. These tests cover the mechanism itself, independent of any one
// page's content:
//
// 1. The "ready" registry (TRANSLATED_TOOL_SLUGS) and the actual
//    app/[locale]/tools/** route files never drift apart — the single
//    guardrail that keeps every page NOT in that list from ever growing a
//    half-finished foreign-language URL (acceptance criterion 7).
// 2. Every translated tool has complete, non-empty en/ja/ko content (title,
//    description, directAnswer, FAQs) — never a silent fallback to Chinese.
// 3. hreflang reciprocity, including x-default, for translated vs.
//    untranslated pages.
// 4. The legacy `?lang=` redirects in next.config.js land on the right
//    destination for both translated and untranslated pages.
//
// lib/i18n/*.ts are plain .ts with no JSX, so this file dynamically imports
// and exercises them directly (same loader shim as
// tests/tools-category-pages-459.test.mjs). next.config.js and the
// app/[locale]/** route files are verified via source-text inspection, the
// established convention for anything this suite can't import directly.

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
  // attribute requirement entirely.
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
  TRANSLATED_CANONICAL_PATHS,
  PATH_LOCALES,
  isTranslatedPath,
  buildHreflangAlternates,
  buildLocalizedPath,
  resolveLocaleSwitchTarget,
  splitLocalePrefix,
  I18N_SCOPE_PAGES,
  scopeEntryPath,
} = await import("../lib/i18n/translatedPages.ts");

const { getLocalizedToolMeta } = await import("../lib/i18n/toolContent.ts");

// ---------------------------------------------------------------------------
// Guardrail: the filesystem route tree and the "ready" registry never drift
// ---------------------------------------------------------------------------

test("app/[locale]/tools/ contains a page.tsx for exactly TRANSLATED_TOOL_SLUGS, nothing more and nothing less", () => {
  const localeToolsDir = path.join(ROOT_DIR, "app", "[locale]", "tools");
  const entries = fs
    .readdirSync(localeToolsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  assert.deepEqual(
    entries,
    [...TRANSLATED_TOOL_SLUGS].sort(),
    "app/[locale]/tools/ subdirectories must exactly match TRANSLATED_TOOL_SLUGS — this is the guardrail " +
      "that keeps every other (not-yet-translated) page from ever growing a half-finished foreign-language URL",
  );

  for (const slug of TRANSLATED_TOOL_SLUGS) {
    const pagePath = path.join(localeToolsDir, slug, "page.tsx");
    assert.ok(fs.existsSync(pagePath), `app/[locale]/tools/${slug}/page.tsx must exist`);
  }
});

test("app/[locale]/ has no page.tsx of its own yet (the home page isn't a pilot page in this ticket)", () => {
  const localePageFile = path.join(ROOT_DIR, "app", "[locale]", "page.tsx");
  assert.ok(
    !fs.existsSync(localePageFile),
    "app/[locale]/page.tsx must not exist until a future ticket actually translates the home page — " +
      "otherwise /en, /ja, /ko would silently serve something instead of a clean 404",
  );
});

test("this ticket ships exactly 3 translated tool pages", () => {
  assert.deepEqual(
    [...TRANSLATED_TOOL_SLUGS].sort(),
    ["aed", "emergency-hotlines", "er-status"],
    "issue #485 is scoped to exactly these 3 pilot pages",
  );
});

test("I18N_SCOPE_PAGES (the ~21-page roadmap) is a superset of TRANSLATED_CANONICAL_PATHS (what's actually ready)", () => {
  const scopePaths = new Set(I18N_SCOPE_PAGES.map(scopeEntryPath));
  for (const canonicalPath of TRANSLATED_CANONICAL_PATHS) {
    assert.ok(scopePaths.has(canonicalPath), `${canonicalPath} must be in the scope roadmap too`);
  }
  assert.ok(I18N_SCOPE_PAGES.length >= 20, "the scope list should be close to the ~21 pages §Q names");
});

// ---------------------------------------------------------------------------
// Every translated tool has complete, non-empty en/ja/ko content
// ---------------------------------------------------------------------------

test("every TRANSLATED_TOOL_SLUGS entry has complete, non-empty en/ja/ko content — never a silent fallback to Chinese", () => {
  for (const slug of TRANSLATED_TOOL_SLUGS) {
    for (const locale of PATH_LOCALES) {
      const meta = getLocalizedToolMeta(slug, locale);
      assert.ok(meta.title?.trim(), `${slug}/${locale}: title must not be empty`);
      assert.ok(meta.description?.trim(), `${slug}/${locale}: description must not be empty`);
      assert.ok(meta.directAnswer?.trim(), `${slug}/${locale}: directAnswer must not be empty`);
      assert.ok(Array.isArray(meta.faqs) && meta.faqs.length > 0, `${slug}/${locale}: must have at least one FAQ`);
      for (const faq of meta.faqs) {
        assert.ok(faq.question?.trim(), `${slug}/${locale}: a FAQ question must not be empty`);
        assert.ok(faq.answer?.trim(), `${slug}/${locale}: a FAQ answer must not be empty`);
      }

      // Not a lazy clone of the Chinese baseline under a different key.
      const zhMeta = getLocalizedToolMeta(slug, "zh-TW");
      assert.notEqual(meta.title, zhMeta.title, `${slug}/${locale}: title must actually be translated, not a Chinese copy`);
    }
  }
});

test("getLocalizedToolMeta(slug, 'zh-TW') always resolves straight from TOOL_CATALOG", async () => {
  const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");
  for (const slug of TRANSLATED_TOOL_SLUGS) {
    const catalogEntry = TOOL_CATALOG.find((t) => t.slug === slug);
    const meta = getLocalizedToolMeta(slug, "zh-TW");
    assert.equal(meta.title, catalogEntry.title);
    assert.equal(meta.description, catalogEntry.description);
    assert.deepEqual(meta.faqs, catalogEntry.faqs);
  }
});

// ---------------------------------------------------------------------------
// hreflang reciprocity
// ---------------------------------------------------------------------------

test("buildHreflangAlternates returns a reciprocal zh-TW/en/ja/ko + x-default set for a translated page", () => {
  const baseUrl = "https://health.j172.tw";
  const alternates = buildHreflangAlternates("/tools/aed", baseUrl);
  assert.ok(alternates, "a translated page must get a non-null alternates set");
  assert.equal(alternates["zh-TW"], `${baseUrl}/tools/aed`);
  assert.equal(alternates["en"], `${baseUrl}/en/tools/aed`);
  assert.equal(alternates["ja"], `${baseUrl}/ja/tools/aed`);
  assert.equal(alternates["ko"], `${baseUrl}/ko/tools/aed`);
  assert.equal(alternates["x-default"], `${baseUrl}/tools/aed`, "x-default must point at the Chinese default");
});

test("buildHreflangAlternates returns null for a page with no translation", () => {
  const baseUrl = "https://health.j172.tw";
  assert.equal(buildHreflangAlternates("/tools/clinics", baseUrl), null);
  assert.equal(buildHreflangAlternates("/", baseUrl), null, "the home page isn't translated by this ticket");
});

test("isTranslatedPath / TRANSLATED_CANONICAL_PATHS agree with TRANSLATED_TOOL_SLUGS", () => {
  for (const slug of TRANSLATED_TOOL_SLUGS) {
    assert.ok(isTranslatedPath(`/tools/${slug}`));
  }
  assert.ok(!isTranslatedPath("/tools/clinics"));
  assert.equal(TRANSLATED_CANONICAL_PATHS.length, TRANSLATED_TOOL_SLUGS.length);
});

// ---------------------------------------------------------------------------
// Locale-prefix path helpers (splitLocalePrefix / buildLocalizedPath /
// resolveLocaleSwitchTarget) — the switcher's and the metadata builders'
// one shared source of truth.
// ---------------------------------------------------------------------------

test("splitLocalePrefix strips a known locale prefix and leaves zh paths untouched", () => {
  assert.deepEqual(splitLocalePrefix("/en/tools/aed"), { locale: "en", canonicalPath: "/tools/aed" });
  assert.deepEqual(splitLocalePrefix("/ja/tools/er-status"), { locale: "ja", canonicalPath: "/tools/er-status" });
  assert.deepEqual(splitLocalePrefix("/ko"), { locale: "ko", canonicalPath: "/" });
  assert.deepEqual(splitLocalePrefix("/tools/aed"), { locale: "zh-TW", canonicalPath: "/tools/aed" });
  // A tool slug that merely starts with a locale code must not be mistaken
  // for a locale-prefixed path (no such slug exists today, but this guards
  // the prefix-matching logic itself).
  assert.deepEqual(splitLocalePrefix("/enhanced-tool"), { locale: "zh-TW", canonicalPath: "/enhanced-tool" });
});

test("buildLocalizedPath builds /{locale}{path}, and leaves zh-TW unprefixed", () => {
  assert.equal(buildLocalizedPath("/tools/aed", "en"), "/en/tools/aed");
  assert.equal(buildLocalizedPath("/", "ja"), "/ja");
  assert.equal(buildLocalizedPath("/tools/aed", "zh-TW"), "/tools/aed");
});

test("resolveLocaleSwitchTarget navigates for a translated page, returns null for an untranslated one", () => {
  assert.equal(resolveLocaleSwitchTarget("/tools/aed", "en"), "/en/tools/aed");
  assert.equal(resolveLocaleSwitchTarget("/en/tools/aed", "ja"), "/ja/tools/aed", "must re-derive the canonical path first, not double-prefix");
  assert.equal(resolveLocaleSwitchTarget("/en/tools/aed", "zh-TW"), "/tools/aed");
  assert.equal(resolveLocaleSwitchTarget("/tools/clinics", "en"), null, "no translation exists, so the switcher must fall back to chrome-only");
  assert.equal(resolveLocaleSwitchTarget("/tools/clinics", "zh-TW"), "/tools/clinics", "switching to zh-TW is always a no-op navigation");
});

// ---------------------------------------------------------------------------
// next.config.js's legacy ?lang= redirects (source-text inspection — this
// repo's established convention for verifying next.config.js, see
// tests/tools-long-term-care-merge-484.test.mjs)
// ---------------------------------------------------------------------------

test("next.config.js redirects ?lang={locale} to the real /{locale}/ URL for each translated tool", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "next.config.js"), "utf8");
  assert.match(content, /async redirects\(\)/);
  assert.match(content, /\["en", "ja", "ko"\]\.flatMap/, "must generate one rule per locale×translated-slug combination");
  assert.match(content, /\["aed", "er-status", "emergency-hotlines"\]/, "must cover exactly the 3 translated slugs");
  assert.match(content, /destination:\s*`\/\$\{locale\}\/tools\/\$\{slug\}`/);
});

test("next.config.js's catch-all ?lang= cleanup rule comes after the specific per-locale rules (array order matters for Next.js redirects)", () => {
  const content = fs.readFileSync(path.join(ROOT_DIR, "next.config.js"), "utf8");
  const specificRuleIndex = content.indexOf('["en", "ja", "ko"].flatMap');
  const catchAllIndex = content.indexOf('source: "/:path*"');
  assert.ok(specificRuleIndex >= 0 && catchAllIndex >= 0, "both rule blocks must exist");
  assert.ok(specificRuleIndex < catchAllIndex, "the 3 specific redirects must be listed before the generic ?lang= stripper");
});
