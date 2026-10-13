import zhTW from "@/locales/zh-TW.json";
import en from "@/locales/en.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";

/**
 * The 4 locales this app ships. Order is display order (LanguageToggler,
 * hreflang builders, etc. all iterate this same array so nothing drifts).
 */
export type Locale = "zh-TW" | "en" | "ja" | "ko";
export const SUPPORTED_LOCALES: Locale[] = ["zh-TW", "en", "ja", "ko"];

/** The 3 path-prefixed locales (issue #485 §Q) — zh-TW keeps its existing
 * unprefixed URLs and is never itself a `/{locale}/` path segment. */
export type PathLocale = "en" | "ja" | "ko";
export const PATH_LOCALES: PathLocale[] = ["en", "ja", "ko"];

export const isSupportedLocale = (
  value: string | null | undefined,
): value is Locale =>
  typeof value === "string" && (SUPPORTED_LOCALES as string[]).includes(value);

export const isPathLocale = (value: string | null | undefined): value is PathLocale =>
  typeof value === "string" && (PATH_LOCALES as string[]).includes(value);

const DICTIONARIES: Record<Locale, Record<string, unknown>> = {
  "zh-TW": zhTW,
  en,
  ja,
  ko,
};

/**
 * Pure dotted-path lookup against the static locale JSON files — the single
 * implementation shared by both the client-side `useLanguage()`/`t()` (UI
 * chrome strings, app/context/LanguageContext.tsx) and the server-only
 * `getDictionary()` below (full-page SSR content for the /en/ /ja/ /ko/
 * routes). Keeping one lookup function means the two i18n mechanisms the
 * issue #485 brief calls out — client-side chrome-only switching vs.
 * server-rendered full-page locale routing — can never silently diverge in
 * how a `"nav.home"`-style key resolves.
 */
export function lookupDictionaryKey(
  locale: Locale,
  key: string,
  defaultValue?: string,
): string {
  const keys = key.split(".");
  let current: unknown = DICTIONARIES[locale] ?? DICTIONARIES["zh-TW"];

  for (const k of keys) {
    if (current && typeof current === "object" && k in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[k];
    } else {
      current = undefined;
      break;
    }
  }

  if (typeof current === "string") return current;
  return defaultValue ?? key;
}

/**
 * Server-safe translator — usable from async Server Components (e.g.
 * ToolPageShell, app/[locale]/**\/page.tsx) where `useLanguage()` cannot be
 * called (it's a Client Component hook backed by localStorage/cookies).
 * Reads the exact same JSON files `useLanguage()`'s `t()` does.
 */
export function getDictionary(locale: Locale) {
  return {
    locale,
    t: (key: string, defaultValue?: string) => lookupDictionaryKey(locale, key, defaultValue),
  };
}

/** Open Graph `locale` / `alternateLocale` values (BCP-47-ish, underscore
 * form OG expects) for each supported locale. */
export const OG_LOCALE: Record<Locale, string> = {
  "zh-TW": "zh_TW",
  en: "en_US",
  ja: "ja_JP",
  ko: "ko_KR",
};

/** The Open Graph `alternateLocale` list for a given locale — every other
 * supported locale's OG tag. */
export function ogAlternateLocales(locale: Locale): string[] {
  return SUPPORTED_LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALE[l]);
}
