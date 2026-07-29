import type { MetadataRoute } from "next";
import { listLatestNews } from "@/lib/server/news/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Google's single-sitemap ceiling is 50,000 URLs; this cap just needs to stay
// comfortably under that. If the archive ever grows past it, switch to a
// generateSitemaps() split (Next.js supports it) instead of raising this
// further — a single 20k-URL sitemap is already close to the practical
// crawl-budget-friendly limit.
const MAX_SITEMAP_ITEMS = 20_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const items = await listLatestNews(MAX_SITEMAP_ITEMS);

  const newsEntries: MetadataRoute.Sitemap = items.map((item) => ({
    url: `${baseUrl}/news/${item.id}`,
    lastModified: item.published_at_utc ? new Date(item.published_at_utc) : undefined,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const sourceEntries: MetadataRoute.Sitemap = SOURCE_CATEGORIES.flatMap((category) =>
    category.sources.map((source) => ({
      url: `${baseUrl}/news?source=${encodeURIComponent(source.sourceName)}`,
      changeFrequency: "hourly" as const,
      priority: 0.6,
    })),
  );

  const toolEntries: MetadataRoute.Sitemap = TOOL_CATALOG.map((tool) => ({
    url: `${baseUrl}/tools/${tool.slug}`,
    changeFrequency: "monthly" as const,
    priority: 0.6,
  }));

  return [
    { url: baseUrl, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/news`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/tools`, changeFrequency: "monthly", priority: 0.8 },
    ...toolEntries,
    ...sourceEntries,
    ...newsEntries,
  ];
}
