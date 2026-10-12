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
    ];
  },
};

module.exports = nextConfig;
