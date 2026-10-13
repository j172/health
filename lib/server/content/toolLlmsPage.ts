import { TOOL_CATALOG, type ToolCatalogEntry } from "@/lib/server/tools/catalog";
import type { LlmsPageContent, LlmsPageLink, LlmsPageSection } from "./llmsPage";
import type { PathLocale } from "@/lib/i18n/dictionary";
import { lookupDictionaryKey } from "@/lib/i18n/dictionary";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildLocalizedPath, isTranslatedToolSlug } from "@/lib/i18n/translatedPages";

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

/**
 * Locale-aware twin of `buildToolLlmsPageContent` (issue #488, parent #438
 * §Q/§S) — builds the `LlmsPageContent` for a `/{locale}/tools/<slug>` page
 * from exactly the same sources `app/[locale]/tools/<slug>/page.tsx` itself
 * reads from (via `ToolPageShell`): `getLocalizedToolMeta` for
 * title/directAnswer/faqs, and the static `locales/<locale>.json` dictionary
 * (via `lookupDictionaryKey`) for the UI-chrome section headings
 * (`toolShell.formulaHeading` etc.) ToolPageShell already renders through
 * `t()`.
 *
 * `sources` (government scientificBasis citations) and the `formula`/
 * `referenceTable` sections stay verbatim from `ToolCatalogEntry` — exactly
 * as ToolPageShell itself renders them unconditionally regardless of
 * `locale` (see that component's own doc comment: only a tool's *own*
 * title/directAnswer/FAQ get swapped for the locale version; embedded
 * government data/citations are never machine-translated). This mirrors the
 * real page rather than inventing a second, independently maintained
 * translation of content nothing else in the app actually translates.
 */
export function buildLocaleToolLlmsPageContent(
  tool: ToolCatalogEntry,
  locale: PathLocale,
  baseUrl: string,
): LlmsPageContent {
  const url = `${baseUrl}${buildLocalizedPath(`/tools/${tool.slug}`, locale)}`;

  // Callers only ever invoke this for a slug that's actually in
  // TRANSLATED_TOOL_SLUGS (the only slugs app/[locale]/tools/<slug>/page.tsx
  // — and therefore this route — exists for), so `localizedMeta` is always
  // present in practice; the fallback below just keeps this function honest
  // if that guarantee is ever violated rather than throwing.
  const localizedMeta = isTranslatedToolSlug(tool.slug) ? getLocalizedToolMeta(tool.slug, locale) : null;
  const title = localizedMeta?.title ?? tool.title;
  const summary = localizedMeta?.directAnswer ?? tool.directAnswer;
  const faqs = localizedMeta?.faqs ?? tool.faqs;

  const sources: LlmsPageLink[] = tool.scientificBasis.map((basis) => ({
    title: basis.title,
    url: basis.url,
    note: basis.authority,
  }));

  // Related tools: when a related tool is itself translated, link to its
  // own localized page with its localized title (never a dangling
  // /{locale}/tools/<slug> URL for an untranslated one) — same rule
  // app/[locale]/guides/typhoon-earthquake/page.tsx's resolveStepHref/
  // resolveStepToolLabel already apply to guide steps.
  const related: LlmsPageLink[] = tool.relatedSlugs
    .map((slug) => TOOL_CATALOG.find((t) => t.slug === slug))
    .filter((t): t is ToolCatalogEntry => Boolean(t))
    .map((t) =>
      isTranslatedToolSlug(t.slug)
        ? { title: getLocalizedToolMeta(t.slug, locale).title, url: `${baseUrl}${buildLocalizedPath(`/tools/${t.slug}`, locale)}` }
        : { title: t.title, url: `${baseUrl}/tools/${t.slug}` },
    );

  const sections: LlmsPageSection[] = [];

  if (tool.formula) {
    sections.push({
      heading: lookupDictionaryKey(locale, "toolShell.formulaHeading", "計算公式與推算方法 (Formula & Calculation)"),
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
      heading: tableTitle || lookupDictionaryKey(locale, "toolShell.referenceTableDefaultTitle", "標準對照與臨床指引表"),
      paragraphs: [tableLines],
    });
  }

  sections.push({
    heading: lookupDictionaryKey(locale, "toolShell.disclaimerLabel", "醫療資訊免責聲明：").replace(/[:：]\s*$/, ""),
    paragraphs: [lookupDictionaryKey(locale, "toolShell.disclaimerText", TOOL_MEDICAL_DISCLAIMER)],
  });

  return {
    title,
    url,
    summary,
    sources,
    related,
    faqs,
    sections,
  };
}
