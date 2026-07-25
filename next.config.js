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
};

module.exports = nextConfig;
