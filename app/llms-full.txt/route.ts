import { listRecentNewsForLlms } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { displayDate } from "@/lib/format/news";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 250;

const formatDate = (value: Date | string | null): string | null => {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value));
};

/**
 * llms-full.txt (https://llmstxt.org/) — Extended full plain-text knowledge base for
 * AI assistants, LLMs, and Generative Engine Optimization (GEO) agents.
 * Inlines detailed formulas, standards, reference tables, FAQs, and extensive news summaries.
 */
export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const items = await listRecentNewsForLlms(MAX_ITEMS);

  const lines: string[] = [
    `# ${SITE_NAME} - Full LLMs Knowledge Base & Public Health Index`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "## 系統核心資訊與端點 (System Overview & Endpoints)",
    `- Canonical Base URL: ${baseUrl}`,
    `- Short AI Index: ${baseUrl}/llms.txt`,
    `- RSS 2.0 Feed: ${baseUrl}/feed.xml`,
    `- XML Sitemap: ${baseUrl}/sitemap.xml`,
    `- Google News Sitemap: ${baseUrl}/news-sitemap.xml`,
    "",
    "## 30+ 款健康計算工具、評估量表與公衛資料庫完整規格",
    "",
  ];

  for (const tool of TOOL_CATALOG) {
    lines.push(`### ${tool.title}`);
    lines.push(`- URL: ${baseUrl}/tools/${tool.slug}`);
    lines.push(`- 分類: ${tool.group}`);
    lines.push(`- 說明: ${tool.description}`);
    lines.push(`- 核心定義 (Direct Answer): ${tool.directAnswer}`);
    if (tool.formula) {
      lines.push(`- 計算公式: ${tool.formula}`);
    }
    if (tool.scientificBasis.length > 0) {
      lines.push(`- 官方權威依據:`);
      for (const basis of tool.scientificBasis) {
        lines.push(`  * ${basis.title} | ${basis.authority}${basis.url ? ` (${basis.url})` : ""}`);
      }
    }
    if (tool.referenceTable) {
      lines.push(`- 參考標準對照表: ${tool.referenceTable.title || ""}`);
      lines.push(`  * 表頭: ${tool.referenceTable.headers.join(" | ")}`);
      for (const row of tool.referenceTable.rows) {
        lines.push(`  * 資料: ${row.join(" | ")}`);
      }
    }
    if (tool.faqs.length > 0) {
      lines.push("- 常見問題解答 (FAQ):");
      for (const faq of tool.faqs) {
        lines.push(`  * Q: ${faq.question}`);
        lines.push(`    A: ${faq.answer}`);
      }
    }
    lines.push("");
  }

  lines.push("## 最新台灣公衛與官方健康報導知識庫 (Public Health News Archive)", "");

  for (const item of items) {
    const label = resolveAuthorLabel({ dept_name: item.dept_name, source_name: item.source_name, feed_name: item.feed_name });
    const date = formatDate(displayDate(item));
    const summary = item.geo_summary?.trim() || item.meta_description?.trim() || "";
    lines.push(`### ${item.title}`);
    lines.push(`- 網址: ${baseUrl}/news/${item.id}`);
    lines.push(`- 發布單位: ${label}`);
    lines.push(`- 頻道類別: ${item.feed_name}`);
    lines.push(`- 發布日期: ${date ?? "最新"}`);
    if (summary) {
      lines.push(`- AI 核心重點 (GEO Summary): ${summary}`);
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
