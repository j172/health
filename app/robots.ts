import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Leftover routes from the starter template (Solid SaaS Boilerplate)
        // with placeholder demo content unrelated to this site — keep them
        // out of the index instead of deleting the routes outright.
        disallow: ["/blog", "/docs", "/support", "/auth/signin", "/auth/signup", "/error"],
      },
    ],
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/news-sitemap.xml`],
  };
}
