import { TOOL_GROUP_META, getToolCatalogEntry } from "@/lib/server/tools/catalog";
import { GUIDES, buildCategoryPage, buildGuide, getToolCategoryLink } from "@/lib/server/tools/navModel";
import { NEARBY_DEFAULT_TYPES, NEARBY_MORE_TYPES } from "@/lib/server/nearby/registry";
import { NEARBY_SUMMARY } from "./nearbyContent";
import {
  PATH_LOCALES,
  TRANSLATED_PAGES,
  buildLocalizedPath,
  scopeEntryPath,
} from "@/lib/i18n/translatedPages";
import type { PathLocale } from "@/lib/i18n/dictionary";

/**
 * Pure line builders shared by the sitewide `/llms.txt` (app/llms.txt/route.ts)
 * and `/llms-full.txt` (app/llms-full.txt/route.ts) — issue #438 §R's closing
 * requirement ("`/llms.txt`、`/llms-full.txt`、sitemap 一併納入外語版與新頁面類型").
 *
 * Both routes already list every TOOL_CATALOG entry; what they used to lack
 * was everything the 2.0 information architecture added around the tools —
 * the 7 `/tools/category/<group>` hubs, the `/guides` life-situation guides,
 * `/nearby`, and the real `/en/` `/ja/` `/ko/` translated pages (the old
 * language section linked `?lang=en|ja|ko`, which now 301s to the real
 * path-prefixed URLs — see lib/redirects/permanentRedirectRules.ts).
 *
 * Every list here is derived from the same single sources the pages and the
 * sitemap read from (TOOL_GROUP_META + buildCategoryPage, GUIDES + buildGuide,
 * the nearby registry, TRANSLATED_PAGES) — never a second hand-maintained
 * copy — so a new category/guide/translated page can't silently go missing
 * from the AI indexes. No DB, no React, no `next/*`: the routes keep all
 * their DB access; this module only formats.
 */

const LOCALE_LANGUAGE_LABELS: Record<PathLocale, string> = {
  en: "English (en)",
  ja: "日本語 (ja)",
  ko: "한국어 (ko)",
};

const LOCALE_LANGUAGE_NOTES: Record<PathLocale, string> = {
  en: "全球公衛介面支援",
  ja: "外国人旅行者・在住者向け台湾医療・公衆衛生情報",
  ko: "대만 여행객 및 체류자를 위한 공공의료/보건 서비스",
};

/** Absolute URL of a zh canonical path — "/" is the bare base URL. */
const zhUrl = (baseUrl: string, canonicalPath: string): string =>
  canonicalPath === "/" ? baseUrl : `${baseUrl}${canonicalPath}`;

/** Label for a TRANSLATED_PAGES entry: the zh nav label/title for a tool, the registered label for a standalone path. */
function translatedPageLabel(entry: (typeof TRANSLATED_PAGES)[number]): string {
  if (entry.kind === "path") return entry.label;
  const tool = getToolCatalogEntry(entry.slug);
  return tool.navLabel ?? tool.title;
}

/**
 * `## 多語言支援` body lines: the zh home plus the real `/en`, `/ja`, `/ko`
 * path-prefixed homes (not the retired `?lang=` query-param URLs).
 */
export function buildLanguageLines(baseUrl: string): string[] {
  return [
    `- [正體中文 (zh-TW, zh-Hant)](${baseUrl}): 官方權威標準`,
    ...PATH_LOCALES.map(
      (locale) =>
        `- [${LOCALE_LANGUAGE_LABELS[locale]}](${baseUrl}${buildLocalizedPath("/", locale)}): ${LOCALE_LANGUAGE_NOTES[locale]}`,
    ),
  ];
}

/**
 * One line per page that really has en/ja/ko versions (TRANSLATED_PAGES —
 * the same registry routing, hreflang and the sitemap gate on): the zh page
 * with its three real locale URLs. Pages not in the registry have no foreign
 * URL, so they never appear here.
 */
export function buildTranslatedPageLines(baseUrl: string): string[] {
  return TRANSLATED_PAGES.map((entry) => {
    const canonicalPath = scopeEntryPath(entry);
    const localeLinks = PATH_LOCALES.map(
      (locale) => `[${locale}](${baseUrl}${buildLocalizedPath(canonicalPath, locale)})`,
    ).join(" | ");
    return `- [${translatedPageLabel(entry)}](${zhUrl(baseUrl, canonicalPath)}): ${localeLinks}`;
  });
}

/** `## 工具分類` body lines for llms.txt: one link per `/tools/category/<group>` hub, with its intro copy. */
export function buildCategoryIndexLines(baseUrl: string): string[] {
  return TOOL_GROUP_META.map((meta) => {
    const page = buildCategoryPage(meta.group);
    const note = page?.description.trim();
    const href = getToolCategoryLink(meta.group).href;
    return `- [${meta.labelDefault}](${baseUrl}${href})${note ? `: ${note}` : ""}`;
  });
}

/** `## 生活情境指南` body lines for llms.txt: the `/guides` index plus one link per guide. */
export function buildGuideIndexLines(baseUrl: string): string[] {
  return [
    `- [生活情境指南總覽 (Guides Index)](${baseUrl}/guides): 依生活情境排序的步驟指南，一步步帶使用者找到對應工具。`,
    ...GUIDES.map((guide) => `- [${guide.title}](${baseUrl}/guides/${guide.slug}): ${guide.description}`),
  ];
}

/** `## 我附近` body lines for llms.txt. */
export function buildNearbyIndexLines(baseUrl: string): string[] {
  return [`- [我附近 (Nearby)](${baseUrl}/nearby): ${NEARBY_SUMMARY}`];
}

/** llms-full: one `###` block per category hub, listing its member tools. */
export function buildCategoryFullLines(baseUrl: string): string[] {
  const lines: string[] = [];
  for (const meta of TOOL_GROUP_META) {
    const page = buildCategoryPage(meta.group);
    if (!page) continue;
    lines.push(`### ${page.label}`);
    lines.push(`- URL: ${baseUrl}${getToolCategoryLink(meta.group).href}`);
    lines.push(`- 說明: ${page.description}`);
    lines.push(`- 收錄工具 (${page.tools.length}):`);
    for (const tool of page.tools) {
      lines.push(`  * ${tool.navLabel ?? tool.title}: ${baseUrl}/tools/${tool.slug}`);
    }
    lines.push("");
  }
  return lines;
}

/** llms-full: one `###` block per life-situation guide with its ordered steps and FAQ. */
export function buildGuideFullLines(baseUrl: string): string[] {
  const lines: string[] = [`- 指南總覽 URL: ${baseUrl}/guides`, ""];
  for (const guide of GUIDES) {
    const model = buildGuide(guide.slug);
    if (!model) continue;
    lines.push(`### ${model.title}`);
    lines.push(`- URL: ${baseUrl}/guides/${model.slug}`);
    lines.push(`- 說明: ${model.description}`);
    lines.push("- 情境步驟:");
    model.steps.forEach((step, index) => {
      lines.push(`  ${index + 1}. ${step.caption} (${baseUrl}${step.href}): ${step.why}`);
    });
    if (model.faqs.length > 0) {
      lines.push("- 常見問題解答 (FAQ):");
      for (const faq of model.faqs) {
        lines.push(`  * Q: ${faq.question}`);
        lines.push(`    A: ${faq.answer}`);
      }
    }
    lines.push("");
  }
  return lines;
}

/** llms-full: the `/nearby` description plus every facility type it can query. */
export function buildNearbyFullLines(baseUrl: string): string[] {
  const describe = (heading: string, defs: typeof NEARBY_DEFAULT_TYPES): string[] => [
    `- ${heading}:`,
    ...defs.map(
      (def) =>
        `  * ${def.emoji} ${def.label}: ${def.description}${def.toolSlug ? ` (${baseUrl}/tools/${def.toolSlug})` : ""}`,
    ),
  ];
  return [
    "### 我附近：一次定位看全部急用點位",
    `- URL: ${baseUrl}/nearby`,
    `- 說明: ${NEARBY_SUMMARY}`,
    ...describe("8 類預設急用點位", NEARBY_DEFAULT_TYPES),
    ...describe("更多類型（展開後逐類查詢）", NEARBY_MORE_TYPES),
    "",
  ];
}
