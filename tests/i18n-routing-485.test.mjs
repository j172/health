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
  TRANSLATED_STANDALONE_PATHS,
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

  // Issue #488 added `app/[locale]/tools/[slug]/{llms.txt,markdown}/route.ts`
  // — a dynamic-segment sibling (same "static directory + dynamic [slug]
  // fallback" shape as `app/(zh)/tools/[slug]/llms.txt/route.ts`) covering
  // every TRANSLATED_TOOL_SLUGS entry's machine-readable routes with one
  // pair of files, rather than a page.tsx of its own — so it's allowed here
  // alongside the real per-slug page directories without weakening the
  // "nothing more than TRANSLATED_TOOL_SLUGS" guardrail below.
  //
  // Issue #588 (parent #583) added `app/[locale]/tools/global-watch/` —
  // NOT a TRANSLATED_TOOL_SLUGS entry (the base `/tools/global-watch` page
  // stays zh-only; only its item sub-routes are translated, registered
  // instead as `path` entries in TRANSLATED_STANDALONE_PATHS — see that
  // array's comment). It's allowed here as a second, explicit exception
  // for the same reason "[slug]" is: it hosts nested item sub-routes
  // (`earthquakes`, then #589's `epidemics`, more as #583's other items
  // ship) rather than a flat `/tools/<slug>/page.tsx` itself, so this
  // guardrail's intent — never let an untranslated tool slug grow a
  // foreign-language URL by accident — still holds, enforced below instead
  // by asserting the base page.tsx does NOT exist while each item
  // sub-route's does.
  assert.deepEqual(
    entries,
    [...TRANSLATED_TOOL_SLUGS, "[slug]", "global-watch"].sort(),
    "app/[locale]/tools/ subdirectories must exactly match TRANSLATED_TOOL_SLUGS (plus the issue #488 " +
      "[slug] llms.txt/markdown route and the issue #588/#589 global-watch item-sub-route directory) — " +
      "this is the guardrail that keeps every other (not-yet-translated) page from ever growing a " +
      "half-finished foreign-language URL",
  );

  for (const slug of TRANSLATED_TOOL_SLUGS) {
    const pagePath = path.join(localeToolsDir, slug, "page.tsx");
    assert.ok(fs.existsSync(pagePath), `app/[locale]/tools/${slug}/page.tsx must exist`);
  }

  assert.ok(
    !fs.existsSync(path.join(localeToolsDir, "[slug]", "page.tsx")),
    "app/[locale]/tools/[slug]/ must stay route-only (llms.txt/markdown) — a page.tsx there would serve " +
      "every untranslated tool slug as a locale page, defeating the TRANSLATED_TOOL_SLUGS guardrail",
  );

  assert.ok(
    !fs.existsSync(path.join(localeToolsDir, "global-watch", "page.tsx")),
    "app/[locale]/tools/global-watch/page.tsx must NOT exist — the base /tools/global-watch page stays " +
      "zh-only; only its item sub-routes (e.g. earthquakes) are translated (issue #588)",
  );
  assert.ok(
    fs.existsSync(path.join(localeToolsDir, "global-watch", "earthquakes", "page.tsx")),
    "app/[locale]/tools/global-watch/earthquakes/page.tsx must exist (issue #588)",
  );
  for (const routeType of ["llms.txt", "markdown"]) {
    const routePath = path.join(localeToolsDir, "[slug]", routeType, "route.ts");
    assert.ok(fs.existsSync(routePath), `app/[locale]/tools/[slug]/${routeType}/route.ts must exist`);
  }
  // (the "global-watch/page.tsx must NOT exist" check above already covers
  // issue #589's epidemics item too — same base-page-stays-zh-only rule.)
});

test("app/[locale]/tools/global-watch/<item>/page.tsx exists for every global-watch item registered in TRANSLATED_STANDALONE_PATHS (issue #589)", () => {
  const localeToolsDir = path.join(ROOT_DIR, "app", "[locale]", "tools");
  const globalWatchItemPaths = TRANSLATED_STANDALONE_PATHS.filter(
    (entry) => entry.kind === "path" && entry.path.startsWith("/tools/global-watch/"),
  );
  assert.ok(globalWatchItemPaths.length > 0, "expected at least the 國際疫情/epidemics item to be registered");

  for (const entry of globalWatchItemPaths) {
    const segments = entry.path.replace(/^\/tools\//, "").split("/"); // ["global-watch", "epidemics"]
    const pagePath = path.join(localeToolsDir, ...segments, "page.tsx");
    assert.ok(fs.existsSync(pagePath), `${pagePath} must exist for translated path ${entry.path}`);
  }
});

test("app/[locale]/page.tsx exists once the home page itself is translated (issue #487)", () => {
  const localePageFile = path.join(ROOT_DIR, "app", "[locale]", "page.tsx");
  const homeIsTranslated = TRANSLATED_CANONICAL_PATHS.includes("/");
  assert.equal(
    fs.existsSync(localePageFile),
    homeIsTranslated,
    "app/[locale]/page.tsx must exist if and only if '/' is in TRANSLATED_CANONICAL_PATHS — " +
      "otherwise /en, /ja, /ko would either silently serve something unlisted, or 404 despite being listed",
  );
});

test("TRANSLATED_TOOL_SLUGS always contains the 3 issue #485 pilot pages", () => {
  // Issue #485 shipped exactly these 3; later tickets (#486, #487, ...) only
  // ever grow this array, so this is a containment check rather than the
  // original point-in-time exact-equality assertion — otherwise this test
  // would break the moment any later ticket adds its own slugs.
  for (const slug of ["aed", "emergency-hotlines", "er-status"]) {
    assert.ok(TRANSLATED_TOOL_SLUGS.includes(slug), `${slug} must remain translated`);
  }
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
  // "/tools/bmi" (not "/tools/clinics" — clinics was translated by issue
  // #486, after this test was first written) is used here as a page that's
  // not in I18N_SCOPE_PAGES at all, so it stays a safe "definitely
  // untranslated" example regardless of how many more tickets grow
  // TRANSLATED_TOOL_SLUGS.
  assert.equal(buildHreflangAlternates("/tools/bmi", baseUrl), null);
  // Note: "/" (the home page) WAS untranslated as of issue #485 but issue
  // #487 translated it — see tests/i18n-routing-487.test.mjs for its own
  // (non-null) hreflang coverage assertion.
});

test("isTranslatedPath / TRANSLATED_CANONICAL_PATHS agree with TRANSLATED_TOOL_SLUGS", () => {
  for (const slug of TRANSLATED_TOOL_SLUGS) {
    assert.ok(isTranslatedPath(`/tools/${slug}`));
  }
  assert.ok(!isTranslatedPath("/tools/bmi"));
  // issue #487: TRANSLATED_CANONICAL_PATHS also includes the translated
  // STANDALONE pages ("/", "/nearby", "/guides/typhoon-earthquake" — see
  // TRANSLATED_STANDALONE_PATHS), so it's no longer 1:1 with
  // TRANSLATED_TOOL_SLUGS alone; it must be at least as long.
  assert.ok(TRANSLATED_CANONICAL_PATHS.length >= TRANSLATED_TOOL_SLUGS.length);
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
  assert.equal(resolveLocaleSwitchTarget("/tools/bmi", "en"), null, "no translation exists, so the switcher must fall back to chrome-only");
  assert.equal(resolveLocaleSwitchTarget("/tools/bmi", "zh-TW"), "/tools/bmi", "switching to zh-TW is always a no-op navigation");
});

// ---------------------------------------------------------------------------
// Legacy ?lang= redirects — moved out of next.config.js's redirects() into
// middleware.ts / lib/redirects/permanentRedirectRules.ts 2026-10-15: every
// permanent (308) redirect on the site was 500ing because next.config.js's
// redirects() always adds a non-standard Refresh header that this host's
// Cloudflare/LiteSpeed path can't handle. See
// tests/middleware-permanent-redirects.test.mjs for the full story.
// ---------------------------------------------------------------------------

const { PERMANENT_REDIRECT_RULES } = await import("../lib/redirects/permanentRedirectRules.ts");

// Issue #691: translated tools born with their /en//ja//ko/ pages. The `?lang=`
// → real-path redirect rules exist for URLs that were indexed BEFORE path
// locales shipped (#485-#487); a tool created afterwards never had a
// `/tools/<slug>?lang=en` link anywhere, so there is nothing to redirect and the
// redirect rules (lib/redirects/permanentRedirectRules.ts) are left untouched.
const TOOLS_WITHOUT_LEGACY_LANG_URL = new Set(["work-school-status"]);

test("the redirect rules send ?lang={locale} to the real /{locale}/ URL for each translated tool", () => {
  // Containment check (not an exact-array snapshot) so later tickets that
  // grow this slug list don't break this test — every TRANSLATED_TOOL_SLUGS
  // entry must have a matching rule for every locale.
  for (const slug of TRANSLATED_TOOL_SLUGS) {
    // Tools whose page never existed before the path locales have no legacy
    // `?lang=` URL anywhere (nothing to redirect) — see
    // tests/work-school-status-691.test.mjs for why this one is exempt.
    if (TOOLS_WITHOUT_LEGACY_LANG_URL.has(slug)) continue;
    for (const locale of ["en", "ja", "ko"]) {
      const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === `/tools/${slug}` && r.has?.value === locale);
      assert.ok(rule, `missing ?lang=${locale} redirect rule for /tools/${slug}`);
      assert.equal(rule.destination, `/${locale}/tools/${slug}`);
    }
  }
});

test("there is NO generic ?lang= catch-all redirect for untranslated pages (regression guard: that rule was a same-path self-redirect loop)", () => {
  // A rule shaped `source: "/:path*"` -> `destination: "/:path*"` redirects a
  // request back to itself, since Next.js always forwards the incoming query
  // string onto the destination with no way to strip it — confirmed live:
  // `/tools/clinics?lang=en` came back `308 Location: /tools/clinics?lang=en`,
  // an infinite loop for every untranslated page. Untranslated pages don't
  // need a redirect at all: LanguageContext.tsx no longer reads `lang`, so
  // the stray query param is simply ignored and the page renders in Chinese.
  const catchAll = PERMANENT_REDIRECT_RULES.find((r) => r.source === "/:path*" || r.destination === "/:path*");
  assert.equal(
    catchAll,
    undefined,
    "must not redirect every ?lang= URL to the same path — that is a self-redirect loop for every untranslated page",
  );
});
