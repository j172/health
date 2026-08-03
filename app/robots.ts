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
        // (auth/signin and auth/signup were removed outright — decorative,
        // non-functional forms with no wired-up submit handler.)
        disallow: ["/blog", "/docs", "/support", "/error"],
      },
      // Explicit allow for AI answer-engine/training crawlers — GEO goal is to
      // be citable, so these are deliberately not more restrictive than "*".
      // Listed by name (rather than relying on the wildcard rule) so the
      // intent is legible instead of incidental.
      { userAgent: "GPTBot", allow: "/" },
      { userAgent: "ChatGPT-User", allow: "/" },
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "ClaudeBot", allow: "/" },
      { userAgent: "Claude-User", allow: "/" },
      { userAgent: "Claude-SearchBot", allow: "/" },
      { userAgent: "anthropic-ai", allow: "/" },
      { userAgent: "PerplexityBot", allow: "/" },
      { userAgent: "Perplexity-User", allow: "/" },
      { userAgent: "Google-Extended", allow: "/" },
      { userAgent: "GoogleOther", allow: "/" },
      { userAgent: "CCBot", allow: "/" },
      { userAgent: "Applebot-Extended", allow: "/" },
      { userAgent: "Bytespider", allow: "/" },
      { userAgent: "Amazonbot", allow: "/" },
      { userAgent: "meta-externalagent", allow: "/" },
    ],
    sitemap: [`${baseUrl}/sitemap.xml`, `${baseUrl}/news-sitemap.xml`],
  };
}
