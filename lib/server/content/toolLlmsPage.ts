import { TOOL_CATALOG, type ToolCatalogEntry } from "@/lib/server/tools/catalog";
import type { LlmsPageContent, LlmsPageSection } from "./llmsPage";

/**
 * The exact medical-disclaimer copy ToolPageShell.tsx renders at the bottom
 * of every tool page. Shared here so the llms.txt/markdown generator for
 * tool pages can include the identical text instead of a second,
 * independently maintained copy (issue #444 acceptance criterion 5).
 */
export const TOOL_MEDICAL_DISCLAIMER =
  "本工具提供之計算數據、分級與生活建議僅供健康生活與自我評估參考，無法取代專業醫師之臨床診斷、治療計畫或處方諮詢。若有任何身體不適或疾病疑慮，請立即尋求合格醫療機構與專科醫師之專業協助。";

/**
 * Builds the shared `LlmsPageContent` shape for a `/tools/<slug>` page, from
 * exactly the same `ToolCatalogEntry` fields ToolPageShell.tsx renders
 * (`title`/`directAnswer`, `scientificBasis`, `relatedSlugs` resolved via
 * `TOOL_CATALOG`, `faqs`, `formula`, `referenceTable`) — not a re-derivation.
 * Pure function: given the same `tool`/`baseUrl` it always returns the same
 * result.
 */
export function buildToolLlmsPageContent(
  tool: ToolCatalogEntry,
  baseUrl: string,
): LlmsPageContent {
  const url = `${baseUrl}/tools/${tool.slug}`;

  const sources = tool.scientificBasis.map((basis) => ({
    title: basis.title,
    url: basis.url,
    note: basis.authority,
  }));

  const related = tool.relatedSlugs
    .map((slug) => TOOL_CATALOG.find((t) => t.slug === slug))
    .filter((t): t is ToolCatalogEntry => Boolean(t))
    .map((t) => ({ title: t.title, url: `${baseUrl}/tools/${t.slug}` }));

  const sections: LlmsPageSection[] = [];

  if (tool.formula) {
    sections.push({
      heading: "計算公式與推算方法 (Formula & Calculation)",
      paragraphs: [tool.formula],
    });
  }

  if (tool.referenceTable) {
    const { title: tableTitle, headers, rows } = tool.referenceTable;
    const tableLines = [
      `| ${headers.join(" | ")} |`,
      `| ${headers.map(() => "---").join(" | ")} |`,
      ...rows.map((row) => `| ${row.join(" | ")} |`),
    ].join("\n");
    sections.push({
      heading: tableTitle || "標準對照與臨床指引表",
      paragraphs: [tableLines],
    });
  }

  sections.push({
    heading: "醫療資訊免責聲明",
    paragraphs: [TOOL_MEDICAL_DISCLAIMER],
  });

  return {
    title: tool.title,
    url,
    summary: tool.directAnswer,
    sources,
    related,
    faqs: tool.faqs,
    sections,
  };
}
