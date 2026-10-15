import type { Locale } from "@/lib/i18n/dictionary";

/**
 * Issue #438 §R ("外語版：同上並加 `inLanguage`，以 `workTranslation`／
 * `translationOfWork` 連回中文版") — the one place the JSON-LD builders learn
 * what URL/language a page is actually served under.
 *
 * Deliberately dependency-free at runtime (the `Locale` import above is
 * type-only and erased): lib/server/news/seo.ts imports this, and several
 * existing `node --test` suites import seo.ts through a bare resolve-hook
 * shim that cannot load the JSON locale files `lib/i18n/dictionary.ts` pulls
 * in. The `/{locale}{path}` rule below therefore mirrors
 * `buildLocalizedPath` in lib/i18n/translatedPages.ts instead of importing it
 * (tests/jsonld-structured-data-r.test.mjs pins the two against each other).
 */

/** BCP 47 tag emitted as JSON-LD `inLanguage` for each route locale. */
export const LOCALE_LANGUAGE_TAG: Record<Locale, string> = {
  "zh-TW": "zh-TW",
  en: "en",
  ja: "ja",
  ko: "ko",
};

export interface PageLocaleOptions {
  /** Route locale the page is served under. Defaults to "zh-TW" (unchanged zh output). */
  locale?: Locale;
  /** zh (unprefixed) canonical path of the page, e.g. "/tools/aed". Defaults to the builder's own path. */
  canonicalPath?: string;
}

export interface ResolvedPageLocale {
  /** True when the page is a /en /ja /ko version. */
  isLocalized: boolean;
  locale: Locale;
  canonicalPath: string;
  /** Absolute URL of the page actually being rendered (locale-prefixed when localized). */
  url: string;
  /** Absolute URL of the zh original. */
  zhUrl: string;
  /** BCP 47 language tag of the rendered page. */
  inLanguage: string;
  /** Spread into the page's own node: `translationOfWork` back to the zh page. Empty for zh. */
  translationLinks: { translationOfWork?: Record<string, unknown> };
}

const joinUrl = (baseUrl: string, path: string): string => (path === "/" ? baseUrl : `${baseUrl}${path}`);

/** Mirrors `buildLocalizedPath` (lib/i18n/translatedPages.ts): `/en`, `/en/tools/aed`; zh stays unprefixed. */
export const localizedCanonicalPath = (canonicalPath: string, locale: Locale): string => {
  if (locale === "zh-TW") return canonicalPath;
  return canonicalPath === "/" ? `/${locale}` : `/${locale}${canonicalPath}`;
};

export const resolvePageLocale = (
  baseUrl: string,
  defaultCanonicalPath: string,
  options: PageLocaleOptions = {},
): ResolvedPageLocale => {
  const locale: Locale = options.locale ?? "zh-TW";
  const canonicalPath = options.canonicalPath ?? defaultCanonicalPath;
  const zhUrl = joinUrl(baseUrl, canonicalPath);
  const isLocalized = locale !== "zh-TW";
  const url = isLocalized ? joinUrl(baseUrl, localizedCanonicalPath(canonicalPath, locale)) : zhUrl;

  return {
    isLocalized,
    locale,
    canonicalPath,
    url,
    zhUrl,
    inLanguage: LOCALE_LANGUAGE_TAG[locale],
    translationLinks: isLocalized
      ? { translationOfWork: { "@type": "WebPage", url: zhUrl, inLanguage: LOCALE_LANGUAGE_TAG["zh-TW"] } }
      : {},
  };
};
