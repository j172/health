/**
 * All of this site's `permanent: true` (308) redirects, in one place.
 *
 * Why these live here and not in next.config.js's `redirects()` anymore:
 * confirmed live 2026-10-15 that EVERY permanent redirect on the site was
 * returning 500 — not just a handful of old ones, all 80+ entries this file
 * now holds, including one shipped the same day (#590's /tools/earthquakes).
 * Root cause: Next.js's `redirects()` config always emits a non-standard
 * `Refresh: 0;url=...` header alongside `Location` for any 308 (see
 * node_modules/next/dist/server/base-http/index.js — "Since IE11 doesn't
 * support the 308 header add backwards compatibility using refresh header"),
 * and something between Cloudflare and this host's LiteSpeed-fronted origin
 * can't handle that combination — confirmed NOT caused by this session's own
 * Node 24 switch (#634, ruled out by a controlled rollback-and-retest) and
 * NOT caused by any Cloudflare WAF/Transform/Page Rule found via the API
 * (none touch Location/Refresh or redirect responses at all).
 *
 * `NextResponse.redirect()` (used by middleware.ts, which reads this file)
 * does not add that header — confirmed by reading
 * node_modules/next/dist/server/web/spec-extension/response.js, which never
 * mentions "Refresh" — so moving every permanent redirect to middleware
 * sidesteps the host/CDN issue entirely without touching next.config.js's
 * one remaining (non-permanent, already-working) /emergency → 307 entry.
 *
 * Shape is deliberately close to next.config.js's old redirect objects
 * (`source`/`destination`/`permanent: true`, plus `has` for the `?lang=`
 * entries) so the existing source-text regression tests that used to check
 * next.config.js's literal text could move here with a minimal diff — see
 * middleware.test.mjs and the updated i18n-routing-48{5,6,7}.test.mjs /
 * tools-*-redirect.test.mjs files.
 */

export type SupportedRedirectLocale = "en" | "ja" | "ko";

export const REDIRECT_LOCALES: readonly SupportedRedirectLocale[] = ["en", "ja", "ko"];

export interface PermanentRedirectRule {
  /** Exact pathname to match (no query string). */
  source: string;
  /** Where to send the browser — may itself carry a query string (e.g. `?tab=`, `?type=`). */
  destination: string;
  /** Always true in this file — see the module doc comment for why non-permanent redirects stay in next.config.js instead. */
  permanent: true;
  /**
   * Issue #485/#486/#487's legacy `?lang=<locale>` mechanism: only matches
   * when the incoming request's query string has this exact `lang` value —
   * mirrors next.config.js's old `has: [{ type: "query", key: "lang", value }]`
   * matcher, which only does exact value matches, not wildcards (hence one
   * rule per locale, same as before).
   */
  has?: { type: "query"; key: "lang"; value: SupportedRedirectLocale };
}

// issue #485 (2.0 §Q): the old `?lang=en|ja|ko` query-param mechanism never
// actually served a translated page server-side (Googlebot fetching
// `/tools/aed?lang=en` got back `<html lang="zh-Hant-TW">` and Chinese
// content) — these permanently redirect to the real path-prefixed URL for
// every tool page that now has one. Issue #486 grew this list from the
// original 3 pilot slugs to the full medical/transport/weather/disaster
// batch; issue #487 adds 4 more (cool-spots/cultural-events/heritage-map/
// tourism-factories). Add a slug here ONLY once it's genuinely in
// TRANSLATED_TOOL_SLUGS (lib/i18n/translatedPages.ts) with real content,
// never ahead of it.
const LANG_QUERY_TOOL_SLUGS = [
  "aed",
  "er-status",
  "emergency-hotlines",
  "clinics",
  "pharmacies",
  "public-toilets",
  "metro-alerts",
  "accessible-transit",
  "weather-alerts",
  "aqi",
  "uv",
  "disaster-map",
  "cool-spots",
  "cultural-events",
  "heritage-map",
  "tourism-factories",
] as const;

// issue #487: the same `?lang=` → real-path redirect, extended to the 3
// translated STANDALONE (non-/tools/<slug>) pages.
const LANG_QUERY_STANDALONE_PAGES: { source: string; destination: (locale: SupportedRedirectLocale) => string }[] = [
  { source: "/", destination: (locale) => `/${locale}` },
  { source: "/nearby", destination: (locale) => `/${locale}/nearby` },
  { source: "/guides/typhoon-earthquake", destination: (locale) => `/${locale}/guides/typhoon-earthquake` },
];

// Every other `?lang=` hit (any other page) has no translated destination
// yet and is deliberately NOT redirected — Next.js always forwards the
// incoming query string onto a redirect's destination with no opt-out, so a
// same-path rule here would redirect a request straight back to itself
// (confirmed live once already: `/tools/clinics?lang=en` came back as a
// same-URL 308, an infinite loop for every untranslated page). These pages
// simply ignore the `lang` param and render in Chinese, which is the
// "untranslated pages stay Chinese-only" acceptance criterion.

const simpleRedirects: Omit<PermanentRedirectRule, "permanent">[] = [
  // issue #484 (2.0 §D merge item M4): "/tools/hakka-bogong" itself was
  // merged into "/tools/long-term-care?type=hakka-bogong" — this older
  // redirect (predating that merge) now has to chain to the new destination
  // directly instead of landing on a page that no longer exists.
  { source: "/tools/hakka-community", destination: "/tools/long-term-care?type=hakka-bogong" },
  { source: "/tools/tax-organizations", destination: "/tools/npo-organizations" },
  // issue #256 (navbar/footer reclassification + 5 tool merges) — every
  // merged-away slug 301s to its new merged tool page.
  { source: "/tools/child-welfare-nurseries", destination: "/tools/child-welfare-institutions" },
  { source: "/tools/child-welfare-centers", destination: "/tools/child-welfare-institutions" },
  // issue #448: predates the `?tab=` initialKey plumbing that PR added for
  // green-shops — now that it exists, these three land on their own tab
  // instead of green-certifications' default (green-shops) tab.
  { source: "/tools/green-hotels", destination: "/tools/green-certifications?tab=green-hotels" },
  { source: "/tools/green-products", destination: "/tools/green-certifications?tab=green-products" },
  { source: "/tools/green-restaurants", destination: "/tools/green-certifications?tab=green-restaurants" },
  { source: "/tools/water-level-stations", destination: "/tools/water-conditions" },
  { source: "/tools/reservoir-status", destination: "/tools/water-conditions" },
  { source: "/tools/family-cultural-activities", destination: "/tools/cultural-events" },
  { source: "/tools/carbon-footprint-products", destination: "/tools/carbon-footprint" },
  { source: "/tools/carbon-footprint-coefficients", destination: "/tools/carbon-footprint" },
  // issue #447 (2.0 §D merge item M1) — "/tools/ltc-contracted" was a
  // noindex ghost page whose facility type/categories are a strict subset of
  // "/tools/long-term-care". Retired, not merged.
  { source: "/tools/ltc-contracted", destination: "/tools/long-term-care" },
  // issue #448 (2.0 §D merge item M2) — "/tools/green-shops" uses the exact
  // same `green_shop` facility data as the "綠色商店" tab on
  // /tools/green-certifications, so it 301s there with `?tab=`.
  { source: "/tools/green-shops", destination: "/tools/green-certifications?tab=green-shops" },
  // issue #483 (2.0 §D merge item M3) — "/tools/cpc-stations" merged into
  // "/tools/cpc-prices" as its "附近加油站" tab.
  { source: "/tools/cpc-stations", destination: "/tools/cpc-prices?tab=stations" },
  // issue #484 (2.0 §D merge item M4) — these three merged into
  // "/tools/long-term-care" as a type filter.
  { source: "/tools/home-healthcare", destination: "/tools/long-term-care?type=home-healthcare" },
  { source: "/tools/elder-welfare", destination: "/tools/long-term-care?type=elder-welfare" },
  { source: "/tools/hakka-bogong", destination: "/tools/long-term-care?type=hakka-bogong" },
  // issue #590 (parent #583) — "/tools/earthquakes" retired in favor of its
  // global-watch item sub-route.
  { source: "/tools/earthquakes", destination: "/tools/global-watch/earthquakes" },
  // issue #591 (parent #583, global-watch merge) — "/tools/travel-epidemic-alerts"
  // retired in favor of the 國際疫情 item #589 already shipped. This page only
  // ever had a zh route, so a single entry is enough.
  { source: "/tools/travel-epidemic-alerts", destination: "/tools/global-watch/epidemics" },
  // issue #727 — YouBike 與網站主題無關，整個移除；舊網址導向工具首頁。
  // `/tools/youbike?lang=en|ja|ko` 的舊 `?lang=` 規則也一併拿掉（LANG_QUERY_TOOL_SLUGS），
  // 所以那類網址落到這條規則，只會導向一次到 /tools，不會先繞去 /en/tools/youbike。
  { source: "/tools/youbike", destination: "/tools" },
];

export const PERMANENT_REDIRECT_RULES: PermanentRedirectRule[] = [
  ...REDIRECT_LOCALES.flatMap((locale) =>
    LANG_QUERY_TOOL_SLUGS.map(
      (slug): PermanentRedirectRule => ({
        source: `/tools/${slug}`,
        destination: `/${locale}/tools/${slug}`,
        permanent: true,
        has: { type: "query", key: "lang", value: locale },
      }),
    ),
  ),
  ...REDIRECT_LOCALES.flatMap((locale) =>
    LANG_QUERY_STANDALONE_PAGES.map(
      (rule): PermanentRedirectRule => ({
        source: rule.source,
        destination: rule.destination(locale),
        permanent: true,
        has: { type: "query", key: "lang", value: locale },
      }),
    ),
  ),
  ...simpleRedirects.map((rule): PermanentRedirectRule => ({ ...rule, permanent: true })),
  // issue #590 (parent #583) — earthquakes' 3 locale-prefixed siblings, since
  // it was itself a TRANSLATED_TOOL_SLUGS entry with real en/ja/ko content
  // (now removed from that list), straight to the item sub-route's own real
  // translated content (also issue #588), not back to zh.
  ...REDIRECT_LOCALES.map(
    (locale): PermanentRedirectRule => ({
      source: `/${locale}/tools/earthquakes`,
      destination: `/${locale}/tools/global-watch/earthquakes`,
      permanent: true,
    }),
  ),
  // issue #727 — YouBike 的 3 個語系版也導向（中文）工具首頁 /tools：/tools 沒有語系版，
  // 而且被移除的功能在英日韓也不存在，不必硬導到 /{locale}/tools。
  ...REDIRECT_LOCALES.map(
    (locale): PermanentRedirectRule => ({
      source: `/${locale}/tools/youbike`,
      destination: "/tools",
      permanent: true,
    }),
  ),
];
