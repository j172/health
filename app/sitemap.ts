import type { MetadataRoute } from "next";
import { listLatestNews } from "@/lib/server/news/queries";
import { getBaseUrl } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const items = await listLatestNews(500);

  const newsEntries: MetadataRoute.Sitemap = items.map((item) => ({
    url: `${baseUrl}/news/${item.id}`,
    lastModified: item.published_at_utc ? new Date(item.published_at_utc) : undefined,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  return [
    { url: baseUrl, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/news`, changeFrequency: "hourly", priority: 0.9 },
    ...newsEntries,
  ];
}
