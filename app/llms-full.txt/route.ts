import { listRecentNewsForLlms } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 250;

const formatDate = (value: Date | null): string | null => {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value));
};

/**
 * llms-full.txt (https://llmstxt.org/) — Extended full plain-text index for
 * AI assistants, LLMs, and Generative Engine Optimization (GEO) agents.
 * Inlines detailed summaries and full metadata across all tools and recent news.
 */
export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const items = await listRecentNewsForLlms(MAX_ITEMS);

  const lines: string[] = [
    `# ${SITE_NAME} - Full LLMs Knowledge Base`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    `Canonical Base URL: ${baseUrl}`,
    `LLM Short Index: ${baseUrl}/llms.txt`,
    `Sitemap: ${baseUrl}/sitemap.xml`,
    `News Sitemap: ${baseUrl}/news-sitemap.xml`,
    "",
    "## 系統工具目錄",
    "",
  ];

  for (const tool of TOOL_CATALOG) {
    lines.push(`### ${tool.title}`);
    lines.push(`- URL: ${baseUrl}/tools/${tool.slug}`);
    lines.push(`- 分類: ${tool.group}`);
    lines.push(`- 說明: ${tool.description}`);
    if (tool.faqs.length > 0) {
      lines.push("- 常見問題解答:");
      for (const faq of tool.faqs) {
        lines.push(`  * Q: ${faq.question}`);
        lines.push(`    A: ${faq.answer}`);
      }
    }
    lines.push("");
  }

  lines.push("## 最新公衛與健康報導摘要庫", "");

  for (const item of items) {
    const label = resolveAuthorLabel({ dept_name: item.dept_name, source_name: item.source_name, feed_name: item.feed_name });
    const date = formatDate(item.published_at_utc);
    const summary = item.geo_summary?.trim() || item.meta_description?.trim() || "";
    lines.push(`### ${item.title}`);
    lines.push(`- 連結: ${baseUrl}/news/${item.id}`);
    lines.push(`- 發布單位: ${label}`);
    lines.push(`- 發布日期: ${date ?? "最新"}`);
    if (summary) {
      lines.push(`- AI 核心摘要: ${summary}`);
    }
    lines.push("");
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
