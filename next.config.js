/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  distDir: ".next3",
  images: {
    unoptimized: true,
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.j172.tw",
      },
      {
        protocol: "https",
        hostname: "blog.j172.tw",
      },
      {
        protocol: "https",
        hostname: "health.j172.tw",
      },
    ],
  },
  async headers() {
    const publicCache = {
      key: "Cache-Control",
      value: "public, s-maxage=60, stale-while-revalidate=600",
    };
    const immutableStaticCache = {
      key: "Cache-Control",
      value: "public, max-age=31536000, immutable",
    };
    return [
      { source: "/", headers: [publicCache] },
      { source: "/news", headers: [publicCache] },
      { source: "/news/:path*", headers: [publicCache] },
      { source: "/tools", headers: [publicCache] },
      { source: "/tools/:path*", headers: [publicCache] },
      { source: "/llms.txt", headers: [publicCache] },
      { source: "/llms-full.txt", headers: [publicCache] },
      { source: "/_next/static/:path*", headers: [immutableStaticCache] },
      { source: "/images/:path*", headers: [immutableStaticCache] },
      // Admin pages carry a session cookie and must never be cached by the PHP
      // handler, a proxy, or the browser, nor leak their URL through Referer.
      {
        source: "/admin/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
      // The ingestion-run log is the one admin GET; it must not be cached either.
      {
        source: "/api/admin/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/emergency",
        destination: "/tools/emergency-hotlines",
        permanent: false,
      },
      // issue #485 (2.0 §Q): the old `?lang=en|ja|ko` query-param mechanism
      // never actually served a translated page server-side (Googlebot
      // fetching `/tools/aed?lang=en` got back `<html lang="zh-Hant-TW">`
      // and Chinese content) — these permanently redirect to the real
      // path-prefixed URL for every tool page that now has one. Each locale
      // needs its own `has` entry since Next.js redirect `has` matching is
      // an exact query value match, not a wildcard. Issue #486 grew this
      // list from the original 3 pilot slugs to the full medical/transport/
      // weather/disaster batch; issue #487 (below) adds 4 more
      // (cool-spots/cultural-events/heritage-map/tourism-factories) plus 3
      // translated STANDALONE pages — add a slug here ONLY once it's
      // genuinely in TRANSLATED_TOOL_SLUGS (lib/i18n/translatedPages.ts)
      // with real content, never ahead of it.
      ...["en", "ja", "ko"].flatMap((locale) =>
        [
          "aed",
          "er-status",
          "emergency-hotlines",
          "clinics",
          "pharmacies",
          "public-toilets",
          "youbike",
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
        ].map((slug) => ({
          source: `/tools/${slug}`,
          has: [{ type: "query", key: "lang", value: locale }],
          destination: `/${locale}/tools/${slug}`,
          permanent: true,
        })),
      ),
      // issue #487: the same `?lang=` → real-path redirect, extended to the
      // 3 translated STANDALONE (non-/tools/<slug>) pages — home ("/"),
      // "/nearby", and the "typhoon-earthquake" life-situation guide. Kept
      // as its own flatMap (rather than folded into the one above) since
      // each entry's `destination` shape differs per page, not just per slug.
      ...["en", "ja", "ko"].flatMap((locale) =>
        [
          { source: "/", destination: `/${locale}` },
          { source: "/nearby", destination: `/${locale}/nearby` },
          { source: "/guides/typhoon-earthquake", destination: `/${locale}/guides/typhoon-earthquake` },
        ].map((rule) => ({
          ...rule,
          has: [{ type: "query", key: "lang", value: locale }],
          permanent: true,
        })),
      ),
      // Every other `?lang=` hit (any other page) has no
      // translated destination yet. Deliberately NOT redirected: Next.js
      // always forwards the incoming query string onto a redirect's
      // destination with no opt-out, so a same-path rule like
      // `source: "/:path*" -> destination: "/:path*"` redirects a request
      // straight back to itself (confirmed live: `/tools/clinics?lang=en`
      // came back as `308 Location: /tools/clinics?lang=en`, an infinite
      // loop for every one of the ~78 pages with no translation yet) — an
      // earlier version of this file had exactly that rule. These pages
      // don't need a redirect at all: LanguageContext.tsx no longer reads
      // the `lang` query param (its old `urlLang` handling was removed by
      // this same ticket), so the param is simply ignored and the page
      // renders normally in Chinese — which is exactly what the "untranslated
      // pages stay Chinese-only" acceptance criterion asks for.
      {
        // issue #484 (2.0 §D merge item M4): "/tools/hakka-bogong" itself was
        // merged into "/tools/long-term-care?type=hakka-bogong" — this older
        // redirect (predating that merge) now has to chain to the new
        // destination directly instead of landing on a page that no longer
        // exists.
        source: "/tools/hakka-community",
        destination: "/tools/long-term-care?type=hakka-bogong",
        permanent: true,
      },
      {
        source: "/tools/tax-organizations",
        destination: "/tools/npo-organizations",
        permanent: true,
      },
      // issue #256 (navbar/footer reclassification + 5 tool merges) — every
      // merged-away slug 301s to its new merged tool page.
      {
        source: "/tools/child-welfare-nurseries",
        destination: "/tools/child-welfare-institutions",
        permanent: true,
      },
      {
        source: "/tools/child-welfare-centers",
        destination: "/tools/child-welfare-institutions",
        permanent: true,
      },
      {
        // issue #448: predates the `?tab=` initialKey plumbing that PR added
        // for green-shops — now that it exists, carry it here too so these
        // three land on their own tab instead of green-certifications'
        // default (green-shops) tab.
        source: "/tools/green-hotels",
        destination: "/tools/green-certifications?tab=green-hotels",
        permanent: true,
      },
      {
        source: "/tools/green-products",
        destination: "/tools/green-certifications?tab=green-products",
        permanent: true,
      },
      {
        source: "/tools/green-restaurants",
        destination: "/tools/green-certifications?tab=green-restaurants",
        permanent: true,
      },
      {
        source: "/tools/water-level-stations",
        destination: "/tools/water-conditions",
        permanent: true,
      },
      {
        source: "/tools/reservoir-status",
        destination: "/tools/water-conditions",
        permanent: true,
      },
      {
        source: "/tools/family-cultural-activities",
        destination: "/tools/cultural-events",
        permanent: true,
      },
      {
        source: "/tools/carbon-footprint-products",
        destination: "/tools/carbon-footprint",
        permanent: true,
      },
      {
        source: "/tools/carbon-footprint-coefficients",
        destination: "/tools/carbon-footprint",
        permanent: true,
      },
      // issue #447 (2.0 §D merge item M1) — "/tools/ltc-contracted" was a
      // noindex ghost page whose facility type and categories are a strict
      // subset of "/tools/long-term-care" (which already covers every
      // contracted service item it offered). Retired, not merged: there was
      // no content here that long-term-care didn't already have.
      {
        source: "/tools/ltc-contracted",
        destination: "/tools/long-term-care",
        permanent: true,
      },
      // issue #448 (2.0 §D merge item M2) — "/tools/green-shops" was the one
      // member of the #256 green-certification-family merge left on its own
      // page/catalog entry; it uses the exact same `green_shop` facility data
      // as the "綠色商店" tab on /tools/green-certifications, so it 301s there
      // with a query param that auto-selects that tab instead of the default.
      {
        source: "/tools/green-shops",
        destination: "/tools/green-certifications?tab=green-shops",
        permanent: true,
      },
      // issue #483 (2.0 §D merge item M3) — "/tools/cpc-stations" (中油加油站
      // 服務據點地圖) merged into "/tools/cpc-prices" as its "附近加油站" tab;
      // the old page both fetched and rendered genuinely different content
      // from cpc-prices (not a duplicate-data retirement like M1/M2), so this
      // 301 carries `?tab=stations` to land directly on the matching tab.
      {
        source: "/tools/cpc-stations",
        destination: "/tools/cpc-prices?tab=stations",
        permanent: true,
      },
      // issue #484 (2.0 §D merge item M4) — "/tools/home-healthcare",
      // "/tools/elder-welfare" and "/tools/hakka-bogong" merged into
      // "/tools/long-term-care" ("長照照顧圈地圖") as a type filter; each 301s
      // with `?type=` carrying its matching facilitySearchConfigs key so the
      // redirect lands directly on the right facility type instead of the
      // default (long-term-care itself).
      {
        source: "/tools/home-healthcare",
        destination: "/tools/long-term-care?type=home-healthcare",
        permanent: true,
      },
      {
        source: "/tools/elder-welfare",
        destination: "/tools/long-term-care?type=elder-welfare",
        permanent: true,
      },
      {
        source: "/tools/hakka-bogong",
        destination: "/tools/long-term-care?type=hakka-bogong",
        permanent: true,
      },
      // issue #590 (parent #583) — "/tools/earthquakes" is retired in favor
      // of its global-watch item sub-route, "/tools/global-watch/earthquakes"
      // (shipped by issue #588). Unlike the ?tab=/?type= retirements above,
      // earthquakes was itself a TRANSLATED_TOOL_SLUGS entry (now removed
      // from that list) with real en/ja/ko content, so its 3 locale-prefixed
      // siblings need their own 301s too — straight to the item sub-route's
      // own real translated content (also issue #588), not back to zh.
      {
        source: "/tools/earthquakes",
        destination: "/tools/global-watch/earthquakes",
        permanent: true,
      },
      ...["en", "ja", "ko"].map((locale) => ({
        source: `/${locale}/tools/earthquakes`,
        destination: `/${locale}/tools/global-watch/earthquakes`,
        permanent: true,
      })),
    ];
  },
};

module.exports = nextConfig;
