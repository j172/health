import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";

// Issue #486 (parent #438 §Q) — the medical/transport/weather/disaster
// i18n batch (clinics, pharmacies, public-toilets,
// accessible-transit, weather-alerts, earthquakes, aqi, uv, disaster-map),
// built on top of issue #485's /en//ja//ko/ routing mechanism. This suite
// only covers what's specific to THIS batch — the mechanism itself (hreflang
// reciprocity, the locale-prefix helpers, the catch-all-redirect regression
// guard) is already exercised by tests/i18n-routing-485.test.mjs and is not
// duplicated here.

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
  PATH_LOCALES,
  isTranslatedPath,
  buildHreflangAlternates,
  TRANSLATED_CANONICAL_PATHS,
} = await import("../lib/i18n/translatedPages.ts");

const { getLocalizedToolMeta } = await import("../lib/i18n/toolContent.ts");
const { TOOL_CATALOG } = await import("../lib/server/tools/catalog.ts");

// This ticket's own batch of 11 slugs (verified against lib/server/tools/catalog.ts,
// not guessed from the issue's Chinese names — "clinics" not "medical-facilities",
// "public-toilets" not "restrooms", etc.)
//
// "earthquakes" was one of these 11 originally, but issue #590 (parent #583)
// retired that standalone tool/page in favor of a global-watch item
// sub-route ("/tools/global-watch/earthquakes") — removed from TOOL_CATALOG,
// TRANSLATED_TOOL_SLUGS, and app/[locale]/tools/earthquakes/ entirely, so
// every assertion below (which all iterate this list) would otherwise fail
// against a slug this repo no longer has. Dropped here rather than kept as
// a "still batch-486, but retired" exception, since nothing downstream
// treats batch membership and current-existence as separable; #590's own
// test file covers the replacement path's redirect/structure instead.
const BATCH_486_SLUGS = [
  "clinics",
  "pharmacies",
  "public-toilets",
  "accessible-transit",
  "weather-alerts",
  "aqi",
  "uv",
  "disaster-map",
];

test("every issue #486 batch slug has a real TOOL_CATALOG entry (slugs weren't guessed from Chinese names)", () => {
  for (const slug of BATCH_486_SLUGS) {
    const entry = TOOL_CATALOG.find((t) => t.slug === slug);
    assert.ok(entry, `TOOL_CATALOG must have a "${slug}" entry`);
  }
});

test("TRANSLATED_TOOL_SLUGS includes every issue #486 batch slug", () => {
  for (const slug of BATCH_486_SLUGS) {
    assert.ok(
      TRANSLATED_TOOL_SLUGS.includes(slug),
      `TRANSLATED_TOOL_SLUGS must include "${slug}"`,
    );
  }
});

test("app/[locale]/tools/<slug>/page.tsx exists for every issue #486 batch slug", () => {
  for (const slug of BATCH_486_SLUGS) {
    const pagePath = path.join(ROOT_DIR, "app", "[locale]", "tools", slug, "page.tsx");
    assert.ok(fs.existsSync(pagePath), `app/[locale]/tools/${slug}/page.tsx must exist`);
  }
});

// ---------------------------------------------------------------------------
// Content completeness — acceptance criterion: "/en/, /ja/, /ko/ URLs all
// exist with COMPLETE translated content — no empty strings and no silent
// fallback to Chinese anywhere".
// ---------------------------------------------------------------------------

test("every issue #486 batch slug has complete, non-empty en/ja/ko content — never a silent fallback to Chinese", () => {
  for (const slug of BATCH_486_SLUGS) {
    const zhMeta = getLocalizedToolMeta(slug, "zh-TW");
    for (const locale of PATH_LOCALES) {
      const meta = getLocalizedToolMeta(slug, locale);
      assert.ok(meta.title?.trim(), `${slug}/${locale}: title must not be empty`);
      assert.ok(meta.description?.trim(), `${slug}/${locale}: description must not be empty`);
      assert.ok(meta.directAnswer?.trim(), `${slug}/${locale}: directAnswer must not be empty`);
      assert.ok(
        Array.isArray(meta.faqs) && meta.faqs.length > 0,
        `${slug}/${locale}: must have at least one FAQ`,
      );
      for (const faq of meta.faqs) {
        assert.ok(faq.question?.trim(), `${slug}/${locale}: a FAQ question must not be empty`);
        assert.ok(faq.answer?.trim(), `${slug}/${locale}: a FAQ answer must not be empty`);
      }

      // Not a lazy clone of the Chinese baseline under a different key.
      assert.notEqual(
        meta.title,
        zhMeta.title,
        `${slug}/${locale}: title must actually be translated, not a Chinese copy`,
      );
      assert.notEqual(
        meta.description,
        zhMeta.description,
        `${slug}/${locale}: description must actually be translated, not a Chinese copy`,
      );
      assert.notEqual(
        meta.directAnswer,
        zhMeta.directAnswer,
        `${slug}/${locale}: directAnswer must actually be translated, not a Chinese copy`,
      );
    }
  }
});

test("the 3 PathLocale translations of each batch slug are distinct from one another (not 3 copies of the same string)", () => {
  for (const slug of BATCH_486_SLUGS) {
    const [en, ja, ko] = PATH_LOCALES.map((locale) => getLocalizedToolMeta(slug, locale));
    assert.notEqual(en.title, ja.title, `${slug}: en/ja titles must differ`);
    assert.notEqual(en.title, ko.title, `${slug}: en/ko titles must differ`);
    assert.notEqual(ja.title, ko.title, `${slug}: ja/ko titles must differ`);
  }
});

test("getLocalizedToolMeta(slug, 'zh-TW') resolves straight from TOOL_CATALOG for every batch slug", () => {
  for (const slug of BATCH_486_SLUGS) {
    const catalogEntry = TOOL_CATALOG.find((t) => t.slug === slug);
    const meta = getLocalizedToolMeta(slug, "zh-TW");
    assert.equal(meta.title, catalogEntry.title);
    assert.equal(meta.description, catalogEntry.description);
    assert.deepEqual(meta.faqs, catalogEntry.faqs);
  }
});

// ---------------------------------------------------------------------------
// hreflang / sitemap alternates — acceptance criterion: coverage for every
// new URL this batch adds. buildHreflangAlternates / TRANSLATED_CANONICAL_PATHS
// are the single source app/sitemap.ts and each page's generateMetadata()
// both read from, so asserting against them here covers both call sites.
// ---------------------------------------------------------------------------

test("every issue #486 batch slug is a translated path with reciprocal hreflang alternates", () => {
  const baseUrl = "https://health.j172.tw";
  for (const slug of BATCH_486_SLUGS) {
    const canonicalPath = `/tools/${slug}`;
    assert.ok(isTranslatedPath(canonicalPath), `${canonicalPath} must be a translated path`);
    assert.ok(
      TRANSLATED_CANONICAL_PATHS.includes(canonicalPath),
      `${canonicalPath} must be in TRANSLATED_CANONICAL_PATHS (feeds app/sitemap.ts)`,
    );

    const alternates = buildHreflangAlternates(canonicalPath, baseUrl);
    assert.ok(alternates, `${canonicalPath} must get a non-null alternates set`);
    assert.equal(alternates["zh-TW"], `${baseUrl}${canonicalPath}`);
    assert.equal(alternates["en"], `${baseUrl}/en${canonicalPath}`);
    assert.equal(alternates["ja"], `${baseUrl}/ja${canonicalPath}`);
    assert.equal(alternates["ko"], `${baseUrl}/ko${canonicalPath}`);
    assert.equal(alternates["x-default"], `${baseUrl}${canonicalPath}`);
  }
});

// ---------------------------------------------------------------------------
// Legacy ?lang= redirects — moved out of next.config.js's redirects() into
// middleware.ts / lib/redirects/permanentRedirectRules.ts 2026-10-15, same
// reasoning as tests/i18n-routing-485.test.mjs and
// tests/middleware-permanent-redirects.test.mjs.
// ---------------------------------------------------------------------------

test("the redirect rules' ?lang= slug list covers every issue #486 batch slug", async () => {
  const { PERMANENT_REDIRECT_RULES } = await import("../lib/redirects/permanentRedirectRules.ts");
  for (const slug of BATCH_486_SLUGS) {
    const rule = PERMANENT_REDIRECT_RULES.find((r) => r.source === `/tools/${slug}` && r.has);
    assert.ok(rule, `the ?lang= redirect rules must include a rule for "${slug}"`);
  }
});

test("there is NO generic ?lang= catch-all redirect (regression guard, shared with issue #485)", async () => {
  const { PERMANENT_REDIRECT_RULES } = await import("../lib/redirects/permanentRedirectRules.ts");
  const catchAll = PERMANENT_REDIRECT_RULES.find((r) => r.source === "/:path*" || r.destination === "/:path*");
  assert.equal(
    catchAll,
    undefined,
    "must not redirect every ?lang= URL to the same path — that is a self-redirect loop for every untranslated page",
  );
});

// ---------------------------------------------------------------------------
// Government data stays Chinese — en's title/directAnswer is the one locale
// where no CJK-vs-Japanese-kanji ambiguity exists, so it's the reliable
// signal that body copy was actually translated rather than left verbatim
// (ja/ko can legitimately contain Han/Hanja characters as part of real
// Japanese/Korean text, so this check is intentionally en-only).
// ---------------------------------------------------------------------------

test("en content for every batch slug contains no untranslated Chinese characters in title/directAnswer", () => {
  for (const slug of BATCH_486_SLUGS) {
    const meta = getLocalizedToolMeta(slug, "en");
    assert.ok(
      !/[一-鿿]/.test(meta.title),
      `${slug}/en: title must not contain untranslated Chinese characters`,
    );
    assert.ok(
      !/[一-鿿]/.test(meta.directAnswer),
      `${slug}/en: directAnswer must not contain untranslated Chinese characters`,
    );
  }
});
