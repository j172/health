/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  distDir: ".next3",
  images: {
    formats: ["image/avif", "image/webp"],
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "**",
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
        source: "/tools/hakka-community",
        destination: "/tools/hakka-bogong",
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
        source: "/tools/green-shops",
        destination: "/tools/green-certifications",
        permanent: true,
      },
      {
        source: "/tools/green-hotels",
        destination: "/tools/green-certifications",
        permanent: true,
      },
      {
        source: "/tools/green-products",
        destination: "/tools/green-certifications",
        permanent: true,
      },
      {
        source: "/tools/green-restaurants",
        destination: "/tools/green-certifications",
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
    ];
  },
};

module.exports = nextConfig;
