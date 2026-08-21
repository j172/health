import { listRecentNewsForLlms } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 100;

const formatDate = (value: Date | null): string | null => {
  if (!value) return null;
  return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeZone: "Asia/Taipei" }).format(new Date(value));
};

/**
 * llms.txt (https://llmstxt.org/) — Concise plain-text index for AI assistants,
 * LLMs, and Generative Engine Optimization (GEO) agents.
 */
export async function GET(): Promise<Response> {
  const baseUrl = getBaseUrl();
  const items = await listRecentNewsForLlms(MAX_ITEMS);

  const lines: string[] = [
    `# ${SITE_NAME}`,
    "",
    `> ${SITE_DESCRIPTION}`,
    "",
    "## 系統端點與導航 (System Endpoints)",
    `- 首頁 (Home): ${baseUrl}`,
    `- 最新公衛新聞 (News Archive): ${baseUrl}/news`,
    `- 健康工具與公衛資料庫 (Tools & Registries): ${baseUrl}/tools`,
    `- RSS 2.0 Feed: ${baseUrl}/feed.xml`,
    `- XML Sitemap: ${baseUrl}/sitemap.xml`,
    `- Google News Sitemap: ${baseUrl}/news-sitemap.xml`,
    `- LLM Full Knowledge Base: ${baseUrl}/llms-full.txt`,
    "",
    "## 多語言支援 (Multi-language Support)",
    "- 正體中文 (zh-TW, zh-Hant) - 官方權威標準",
    "- 简体中文 (zh-CN, zh-Hans) - 即時動態 OpenCC 轉換",
    "- English (en) - 全球公衛介面支援",
    "",
    "## 30+ 款健康計算器與公衛資料庫 (Tools & Registries)",
    "",
  ];

  for (const tool of TOOL_CATALOG) {
    lines.push(`### ${tool.title}`);
    lines.push(`- URL: ${baseUrl}/tools/${tool.slug}`);
    lines.push(`- 核心定義 (Direct Answer): ${tool.directAnswer}`);
    if (tool.formula) {
      lines.push(`- 計算公式: ${tool.formula}`);
    }
    if (tool.scientificBasis.length > 0) {
      lines.push(`- 權威依據: ${tool.scientificBasis.map((b) => `${b.title} (${b.authority})`).join("; ")}`);
    }
    lines.push("");
  }

  lines.push("## 最新公衛與官方健康新聞 (Latest Public Health News with AI Summaries)", "");

  for (const item of items) {
    const label = resolveAuthorLabel({ dept_name: item.dept_name, source_name: item.source_name, feed_name: item.feed_name });
    const date = formatDate(item.published_at_utc);
    const summary = item.geo_summary?.trim() || item.meta_description?.trim() || "";
    lines.push(`### ${item.title}`);
    lines.push(`- 網址: ${baseUrl}/news/${item.id}`);
    lines.push(`- 來源: ${label}${date ? ` | ${date}` : ""}`);
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
