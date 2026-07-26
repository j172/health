import { listRecentNewsForLlms } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 100;

const formatDate = (value: Date | null): string | null => {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value));
};

/**
 * llms.txt (https://llmstxt.org/) — a plain-text index aimed at AI
 * assistants and search engines, distinct from sitemap.xml (built for
 * crawlers enumerating URLs) and robots.txt (crawl permissions). Each entry
 * inlines the article's AI-generated GEO summary directly, so an LLM can
 * answer from this single document without having to fetch every article.
 */
export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const items = await listRecentNewsForLlms(MAX_ITEMS);

  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    "> 彙整台灣衛生福利部及各署即時公告、主要新聞媒體健康版面的繁體中文健康與醫療新聞。",
    "",
    `- 最新新聞: ${baseUrl}/news`,
    `- Sitemap: ${baseUrl}/sitemap.xml`,
    "",
    "## 最新文章",
    "",
  ];

  for (const item of items) {
    const label = resolveAuthorLabel({ dept_name: item.dept_name, source_name: item.source_name, feed_name: item.feed_name });
    const date = formatDate(item.published_at_utc);
    const summary = item.geo_summary?.trim() || item.meta_description?.trim() || "";
    lines.push(`### ${item.title}`);
    lines.push(`URL: ${baseUrl}/news/${item.id}`);
    lines.push(`來源: ${label}${date ? ` | ${date}` : ""}`);
    if (summary) lines.push(summary);
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
