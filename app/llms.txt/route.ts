import { listRecentNewsForLlms } from "@/lib/server/news/queries";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import { TOOL_CATALOG } from "@/lib/server/tools/catalog";
import { displayDate } from "@/lib/format/news";
import {
  buildCategoryIndexLines,
  buildGuideIndexLines,
  buildLanguageLines,
  buildNearbyIndexLines,
  buildTranslatedPageLines,
} from "@/lib/server/content/sitewideLlmsIndex";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ITEMS = 100;

const formatDate = (value: Date | string | null): string | null => {
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
    "## 授權與 AI 取用條款 (License & Open Access)",
    `- [SPDX: MIT AND CC0-1.0](${baseUrl}/LICENSE): 原始程式碼採 MIT 授權；本端點結構化中繼資料與 AI 摘要採 CC0-1.0 公眾領域宣告，歡迎 LLM / AI Agents 自由檢索與引用。`,
    "",
    "## 系統端點與導航 (System Endpoints)",
    `- [首頁 (Home)](${baseUrl})`,
    `- [最新公衛新聞 (News Archive)](${baseUrl}/news)`,
    `- [健康工具與公衛資料庫 (Tools & Registries)](${baseUrl}/tools)`,
    `- [RSS 2.0 Feed](${baseUrl}/feed.xml)`,
    `- [XML Sitemap](${baseUrl}/sitemap.xml)`,
    `- [Google News Sitemap](${baseUrl}/news-sitemap.xml)`,
    `- [生活情境指南 (Guides)](${baseUrl}/guides)`,
    `- [我附近 (Nearby)](${baseUrl}/nearby)`,
    `- [AI Assistant Official Profile (Hey AI)](${baseUrl}/llm-info)`,
    `- [無障礙宣告 (Accessibility)](${baseUrl}/accessibility)`,
    `- [隱私權政策 (Privacy)](${baseUrl}/privacy)`,
    `- [LLM Full Knowledge Base](${baseUrl}/llms-full.txt)`,
    "",
    "## 多語言支援 (Multi-language Support)",
    ...buildLanguageLines(baseUrl),
    "",
    "## 外語版頁面 (Translated Pages: en / ja / ko)",
    ...buildTranslatedPageLines(baseUrl),
    "",
    "## 工具分類 (Tool Categories)",
    ...buildCategoryIndexLines(baseUrl),
    "",
    "## 生活情境指南 (Life-Situation Guides)",
    ...buildGuideIndexLines(baseUrl),
    "",
    "## 我附近 (Nearby)",
    ...buildNearbyIndexLines(baseUrl),
    "",
    `## ${TOOL_CATALOG.length} 款健康計算器與公衛資料庫 (Tools & Registries)`,
    "",
  ];

  for (const tool of TOOL_CATALOG) {
    const note = tool.directAnswer.trim();
    lines.push(`- [${tool.title}](${baseUrl}/tools/${tool.slug})${note ? `: ${note}` : ""}`);
  }

  lines.push("", "## 最新公衛與官方健康新聞 (Latest Public Health News with AI Summaries)", "");

  for (const item of items) {
    const label = resolveAuthorLabel({ dept_name: item.dept_name, source_name: item.source_name, feed_name: item.feed_name });
    const date = formatDate(displayDate(item));
    const summary = item.geo_summary?.trim() || item.meta_description?.trim() || "";
    const note = [label, date, summary].filter(Boolean).join(" | ");
    lines.push(`- [${item.title}](${baseUrl}/news/${item.id})${note ? `: ${note}` : ""}`);
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=1800",
    },
  });
}
