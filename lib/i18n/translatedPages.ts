import { PATH_LOCALES, type Locale, type PathLocale } from "./dictionary";

export { PATH_LOCALES };

/**
 * Issue #485 (parent #438 §Q) — the single centralized list of pages in
 * scope for full multilingual (/en/, /ja/, /ko/) treatment, split into two
 * tiers:
 *
 * - `I18N_SCOPE_PAGES`: the ~21-page list §Q names as the eventual target
 *   (emergency/medical/transport/weather/disaster/tourism pages + home).
 *   This is a *roadmap*, consumed by future tickets (#486/#487/#488) and by
 *   tests that want to assert "ready ⊆ scope" — it does NOT by itself grant
 *   any page a `/en/` URL.
 * - `TRANSLATED_PAGES`: the pages that actually HAVE real per-locale content
 *   right now and therefore get real `/en/`, `/ja/`, `/ko/` routes. This is
 *   the only list the routing, the language switcher, hreflang, sitemap
 *   alternates, and the legacy `?lang=` redirect logic actually gate on.
 *   This ticket ships exactly 3 entries; later tickets grow this array (and
 *   add the matching `app/[locale]/**` route files) without touching the
 *   routing mechanism itself.
 *
 * This asymmetry is deliberate and is the acceptance-criterion-7 guardrail:
 * a page can sit in `I18N_SCOPE_PAGES` for years waiting on translation
 * without ever producing a half-finished foreign-language URL, because nothing
 * reads that list to build a route — only `TRANSLATED_PAGES` does, and
 * `app/[locale]/**` only has files for what's in `TRANSLATED_PAGES`.
 */
export type ScopePageEntry =
  | { kind: "tool"; slug: string }
  | { kind: "path"; path: string; label: string };

export const I18N_SCOPE_PAGES: ScopePageEntry[] = [
  { kind: "path", path: "/", label: "首頁" },
  { kind: "tool", slug: "emergency-hotlines" },
  { kind: "tool", slug: "er-status" },
  { kind: "tool", slug: "aed" },
  { kind: "tool", slug: "clinics" },
  { kind: "tool", slug: "pharmacies" },
  { kind: "tool", slug: "public-toilets" },
  { kind: "tool", slug: "youbike" },
  { kind: "tool", slug: "metro-alerts" },
  { kind: "tool", slug: "accessible-transit" },
  { kind: "tool", slug: "weather-alerts" },
  { kind: "tool", slug: "earthquakes" },
  { kind: "tool", slug: "aqi" },
  { kind: "tool", slug: "uv" },
  { kind: "tool", slug: "disaster-map" },
  { kind: "tool", slug: "cool-spots" },
  { kind: "tool", slug: "cultural-events" },
  { kind: "tool", slug: "heritage-map" },
  { kind: "tool", slug: "tourism-factories" },
  { kind: "path", path: "/nearby", label: "我附近" },
  { kind: "path", path: "/guides/typhoon-earthquake", label: "颱風地震來了" },
  // Issue #588 (parent #583): first global-watch item sub-route.
  { kind: "path", path: "/tools/global-watch/earthquakes", label: "全球動態地球：地震" },
  // Issue #589 (parent #583): 國際疫情 is a nested `/tools/global-watch/
  // epidemics` sub-route, not a flat `/tools/<slug>` page, so it can't be a
  // `{kind: "tool"}` entry (that shape always resolves to `/tools/${slug}`
  // with no slug — see `scopeEntryPath` below). It's a `{kind: "path"}`
  // entry instead, same mechanism TRANSLATED_STANDALONE_PATHS already uses
  // for "/nearby" etc. — everything downstream (isTranslatedPath,
  // buildHreflangAlternates, buildLocalizedPath, resolveLocaleSwitchTarget)
  // works generically off the path string, nested or not.
  { kind: "path", path: "/tools/global-watch/epidemics", label: "國際疫情" },
  // Issue #594 (parent #583): the third global-watch item sub-route.
  { kind: "path", path: "/tools/global-watch/disasters", label: "全球災害" },
  // Issue #598 (parent #583, phase 4): 全球空品, same nested-sub-route
  // reasoning as the epidemics entry just above.
  { kind: "path", path: "/tools/global-watch/air-quality", label: "全球空品" },
];

/** Canonical (zh, unprefixed) path for a scope entry. */
export function scopeEntryPath(entry: ScopePageEntry): string {
  return entry.kind === "tool" ? `/tools/${entry.slug}` : entry.path;
}

/**
 * Tool slugs with real, complete en/ja/ko content today. Issue #485 shipped
 * the first 3 pilot pages; issue #487 (parent #438 §Q, this batch: 涼適點／
 * 藝文活動／文化資產／觀光工廠) adds 4 more. `app/[locale]/tools/<slug>/page.tsx`
 * exists for each one of these and no others — keep this array and that
 * directory listing in lockstep (enforced by tests/i18n-routing-485.test.mjs).
 */
export const TRANSLATED_TOOL_SLUGS = [
  "emergency-hotlines",
  "er-status",
  "aed",
  // Issue #486 (parent #438 §Q): medical/transport/weather/disaster batch.
  "clinics",
  "pharmacies",
  "public-toilets",
  "youbike",
  "metro-alerts",
  "accessible-transit",
  "weather-alerts",
  "earthquakes",
  "aqi",
  "uv",
  "disaster-map",
  // Issue #487 (parent #438 §Q): leisure/culture batch.
  "cool-spots",
  "cultural-events",
  "heritage-map",
  "tourism-factories",
] as const;
export type TranslatedToolSlug = (typeof TRANSLATED_TOOL_SLUGS)[number];

/**
 * Non-tool ("standalone") pages with real, complete en/ja/ko content —
 * issue #487's extension of the #485 registry pattern to page *types* other
 * than `/tools/<slug>`. `TRANSLATED_TOOL_SLUGS` alone can't represent "我附近"
 * (`/nearby`), the homepage (`/`), or a `/guides/<slug>` life-situation guide,
 * since none of those are `{ kind: "tool" }` scope entries — see
 * `ScopePageEntry` above. Rather than inventing a second, parallel gating
 * mechanism, this is the same `{kind, ...}` shape I18N_SCOPE_PAGES already
 * uses, so `TRANSLATED_PAGES`/`TRANSLATED_CANONICAL_PATHS` below (and
 * therefore `isTranslatedPath`, `buildHreflangAlternates`,
 * `resolveLocaleSwitchTarget` — every consumer of this file) gate on exactly
 * the same single source of truth for standalone pages as they already do
 * for tools, with no special-casing anywhere else in this module. A future
 * ticket growing this list only needs the matching `app/[locale]/**`
 * route file(s) — same contract as `TRANSLATED_TOOL_SLUGS`.
 */
export const TRANSLATED_STANDALONE_PATHS: ScopePageEntry[] = [
  { kind: "path", path: "/", label: "首頁" },
  { kind: "path", path: "/nearby", label: "我附近" },
  { kind: "path", path: "/guides/typhoon-earthquake", label: "颱風地震來了" },
  // Issue #588 (parent #583): the first of global-watch's 5 planned item
  // sub-routes (`/tools/global-watch/<item>`) — modeled as its own `path`
  // entry rather than growing TRANSLATED_TOOL_SLUGS with "global-watch",
  // since that would require app/[locale]/tools/global-watch/page.tsx (the
  // BASE page) to exist per tests/i18n-routing-485.test.mjs's guardrail,
  // and the base page staying zh-only is correct for now — only the item
  // sub-routes are in scope for translation (see that test's own comment on
  // why "global-watch" is allowed as a directory without being a
  // TRANSLATED_TOOL_SLUGS entry).
  { kind: "path", path: "/tools/global-watch/earthquakes", label: "全球動態地球：地震" },
  // Issue #589 (parent #583): see I18N_SCOPE_PAGES' matching entry above for
  // why this is a `path` entry rather than a `tool` one. The matching
  // `app/[locale]/tools/global-watch/epidemics/page.tsx` route file is what
  // actually serves /en//ja//ko — tests/i18n-routing-485.test.mjs's
  // directory guardrail allowlists the new "global-watch" top-level
  // directory under app/[locale]/tools/ for exactly this reason.
  { kind: "path", path: "/tools/global-watch/epidemics", label: "國際疫情" },
  // Issue #594 (parent #583): see I18N_SCOPE_PAGES' matching entry above.
  // The matching app/[locale]/tools/global-watch/disasters/page.tsx route
  // file is what actually serves /en//ja//ko for this item.
  { kind: "path", path: "/tools/global-watch/disasters", label: "全球災害" },
  // Issue #598 (parent #583, phase 4): see I18N_SCOPE_PAGES' matching entry
  // above for why this is a `path` entry rather than a `tool` one. The
  // matching `app/[locale]/tools/global-watch/air-quality/page.tsx` route
  // file is what actually serves /en//ja//ko.
  { kind: "path", path: "/tools/global-watch/air-quality", label: "全球空品" },
];

export const TRANSLATED_PAGES: ScopePageEntry[] = [
  ...TRANSLATED_TOOL_SLUGS.map((slug) => ({ kind: "tool" as const, slug })),
  ...TRANSLATED_STANDALONE_PATHS,
];

export const TRANSLATED_CANONICAL_PATHS: string[] = TRANSLATED_PAGES.map(scopeEntryPath);

export function isTranslatedToolSlug(slug: string): slug is TranslatedToolSlug {
  return (TRANSLATED_TOOL_SLUGS as readonly string[]).includes(slug);
}

/** True when `path` (a bare, unprefixed canonical path like "/nearby") is
 * one of the translated standalone (non-tool) pages. */
export function isTranslatedStandalonePath(path: string): boolean {
  return TRANSLATED_STANDALONE_PATHS.some((entry) => scopeEntryPath(entry) === path);
}

/** True when `canonicalPath` (the zh, unprefixed path, e.g. "/tools/aed")
 * has real `/en/`, `/ja/`, `/ko/` versions. */
export function isTranslatedPath(canonicalPath: string): boolean {
  return TRANSLATED_CANONICAL_PATHS.includes(canonicalPath);
}

/**
 * Strips a leading `/en`, `/ja`, or `/ko` path-locale prefix, returning the
 * canonical zh path plus whichever locale (if any) was detected. Used by the
 * language switcher and by metadata/hreflang builders to go from either a
 * `/en/tools/aed`-style pathname or a plain `/tools/aed` one to the same
 * canonical key.
 */
export function splitLocalePrefix(pathname: string): {
  locale: Locale;
  canonicalPath: string;
} {
  for (const locale of PATH_LOCALES) {
    const prefix = `/${locale}`;
    if (pathname === prefix) return { locale, canonicalPath: "/" };
    if (pathname.startsWith(`${prefix}/`)) {
      return { locale, canonicalPath: pathname.slice(prefix.length) || "/" };
    }
  }
  return { locale: "zh-TW", canonicalPath: pathname || "/" };
}

/** Builds the `/{locale}{canonicalPath}` URL for a path-locale, or the bare
 * canonical path for zh-TW. Does NOT check whether a translation exists —
 * callers check `isTranslatedPath()` first. */
export function buildLocalizedPath(canonicalPath: string, locale: Locale): string {
  if (locale === "zh-TW") return canonicalPath;
  if (canonicalPath === "/") return `/${locale}`;
  return `/${locale}${canonicalPath}`;
}

/**
 * Resolves where the language switcher should navigate when the user picks
 * `targetLocale` while on `pathname`. Returns `null` when `pathname`'s page
 * has no translation for a non-zh target (the switcher then falls back to a
 * client-side chrome-only switch + "this page is only available in
 * Chinese" notice instead of navigating) — this is the one function both
 * the locked (locale-prefixed) and unlocked (default zh) LanguageProvider
 * code paths call, so they can never disagree about which pages navigate.
 */
export function resolveLocaleSwitchTarget(
  pathname: string,
  targetLocale: Locale,
): string | null {
  const { canonicalPath } = splitLocalePrefix(pathname);
  if (targetLocale === "zh-TW") return canonicalPath;
  if (!isTranslatedPath(canonicalPath)) return null;
  return buildLocalizedPath(canonicalPath, targetLocale as PathLocale);
}

/** Reciprocal hreflang target set for `canonicalPath` — every language
 * version pointing at every other, including `x-default` → zh. Returns
 * `null` for a page with no translations (nothing to declare). */
export function buildHreflangAlternates(
  canonicalPath: string,
  baseUrl: string,
): Record<string, string> | null {
  if (!isTranslatedPath(canonicalPath)) return null;
  const alternates: Record<string, string> = {
    "zh-TW": `${baseUrl}${canonicalPath}`,
  };
  for (const locale of PATH_LOCALES) {
    alternates[locale] = `${baseUrl}${buildLocalizedPath(canonicalPath, locale)}`;
  }
  alternates["x-default"] = `${baseUrl}${canonicalPath}`;
  return alternates;
}
