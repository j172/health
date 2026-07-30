import type { MetadataRoute } from "next";
import { SITE_NAME, SITE_DESCRIPTION } from "@/lib/server/news/seo";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE_NAME,
    short_name: "j172tw Health",
    description: SITE_DESCRIPTION,
    start_url: "/news",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#625df5",
    lang: "zh-TW",
    icons: [
      { src: "/images/icon/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/images/icon/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/images/icon/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
