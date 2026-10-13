import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/api/admin/", "/api/internal/"],
        // issue #455 (2.0 §T item 347): Content Signals — an explicit,
        // per-use-category policy declaration (https://blog.cloudflare.com/content-signals-policy/),
        // distinct from the per-bot allow/disallow rules below. All three
        // signals "yes" to match this site's CC0 structured-data
        // declaration and the explicit per-bot allows already present:
        // search = ok to index/cite in search results; ai-input = ok to
        // use as RAG/grounding input for a generative answer; ai-train =
        // ok to use for model training/fine-tuning.
        other: { "Content-Signal": "search=yes, ai-input=yes, ai-train=yes" },
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
