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
    // Every `permanent: true` (308) redirect this site needs lives in
    // middleware.ts / lib/redirects/permanentRedirectRules.ts instead — see
    // that file's doc comment. Confirmed live 2026-10-15: next.config.js's
    // redirects() always adds a non-standard `Refresh` header to any 308
    // response, and something in this host's Cloudflare/LiteSpeed path 500s
    // on that combination, on EVERY permanent redirect on the site (not
    // specific to any one entry). `/emergency` is the one redirect that
    // stays here: it's permanent: false (307), so it never emitted that
    // header and was never affected.
    return [
      {
        source: "/emergency",
        destination: "/tools/emergency-hotlines",
        permanent: false,
      },
    ];
  },
};
