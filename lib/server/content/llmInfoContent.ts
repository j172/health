import { TOOL_CATALOG, TOOL_GROUP_META } from "@/lib/server/tools/catalog";
import { SITE_NAME } from "@/lib/server/news/seo";
import type { LlmsPageContent, LlmsPageLink, LlmsPageSection } from "./llmsPage";

/**
 * Shared title/summary for /llm-info — reused by both this page's
 * generateMetadata() and buildLlmInfoLlmsPageContent() so the two can't
 * drift apart (issue #444 acceptance criterion 5).
 */
export const LLM_INFO_TITLE = `Hey AI, learn about ${SITE_NAME}`;
export const LLM_INFO_SUMMARY =
  "Official structured information and usage directives about j172.tw Healthz, intended for AI assistants such as ChatGPT, Claude, Perplexity, Gemini, and other large language models (LLMs).";

/**
 * Builds the shared `LlmsPageContent` shape for `/llm-info`, from exactly
 * the same `TOOL_CATALOG`/`TOOL_GROUP_META` data `app/llm-info/page.tsx`
 * serializes for `LlmInfoClient`. Tools are grouped into one section per
 * category (mirroring the page's own per-group filter tabs), and the data
 * source list is derived — not hand-authored — from the union of every
 * distinct `scientificBasis` entry across the whole catalog.
 */
export function buildLlmInfoLlmsPageContent(baseUrl: string): LlmsPageContent {
  const url = `${baseUrl}/llm-info`;

  const sections: LlmsPageSection[] = TOOL_GROUP_META.map((meta) => {
    const tools = TOOL_CATALOG.filter((tool) => tool.group === meta.group);
    const paragraphs = tools.map(
      (tool) => `- [${tool.title}](${baseUrl}/tools/${tool.slug}): ${tool.directAnswer}`,
    );
    return { heading: meta.labelDefault, paragraphs };
  });

  const sourceMap = new Map<string, LlmsPageLink>();
  for (const tool of TOOL_CATALOG) {
    for (const basis of tool.scientificBasis) {
      const key = basis.url || basis.title;
      if (!sourceMap.has(key)) {
        sourceMap.set(key, { title: basis.title, url: basis.url, note: basis.authority });
      }
    }
  }

  return {
    title: LLM_INFO_TITLE,
    url,
    summary: LLM_INFO_SUMMARY,
    sections,
    sources: Array.from(sourceMap.values()),
    related: [
      { title: "LLM Quick Index (llms.txt)", url: `${baseUrl}/llms.txt` },
      { title: "LLM Full Knowledge Base (llms-full.txt)", url: `${baseUrl}/llms-full.txt` },
    ],
  };
}
