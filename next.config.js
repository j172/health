/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: true,
  distDir: ".next3",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.sanity.io",
        port: "",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "",
      },
    ],
  },
  async headers() {
    // /news and /tools pages carry no per-user state (no auth, no cookies —
    // any personalization like GPS-based facility search happens client-side
    // via /api/facilities, not in the page's own server-rendered HTML), so
    // they're safe to cache briefly at the edge/reverse-proxy layer. That
    // takes real load off the origin pm2 process, which has a history of
    // crashing under memory pressure on this host. A short max-age keeps
    // content close to fresh while still absorbing traffic spikes; the
    // proxying PHP handler (.remote-health-index.php) passes this header
    // straight through, and LiteSpeed's LSCache auto-detects "Cache-Control:
    // public" responses once CacheLookup is on for the vhost.
    const publicCache = { key: "Cache-Control", value: "public, s-maxage=60, stale-while-revalidate=600" };
    return [
      { source: "/news", headers: [publicCache] },
      { source: "/news/:path*", headers: [publicCache] },
      { source: "/tools", headers: [publicCache] },
      { source: "/tools/:path*", headers: [publicCache] },
    ];
  },
};

module.exports = nextConfig;
