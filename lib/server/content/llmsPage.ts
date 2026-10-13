import type { Locale } from "@/lib/i18n/dictionary";

/**
 * Shared pure-function generator for per-page `llms.txt` (https://llmstxt.org/)
 * and clean full-page Markdown output (issue #444).
 *
 * This module knows nothing about tools, news, or any specific page type — it
 * only turns a normalized `LlmsPageContent` shape into text. Every page-type
 * adapter (lib/server/content/toolLlmsPage.ts, newsLlmsPage.ts,
 * privacyContent.ts, accessibilityContent.ts, llmInfoContent.ts) is
 * responsible for building that shape from the *same* data the HTML page
 * itself renders from (TOOL_CATALOG, the news query result, etc.) — never a
 * second, independently maintained copy of the content (issue #444
 * acceptance criterion 5).
 *
 * `buildLlmsTxt` follows llmstxt.org's grammar: an H1 title, a `>` blockquote
 * one-sentence summary, then `##`-headed sections of markdown links — kept
 * deliberately concise (data sources / related pages / FAQ only), matching
 * the llmstxt.org convention that llms.txt itself stays a short index rather
 * than the full page content.
 *
 * `buildLlmsMarkdown` renders the same `LlmsPageContent` as a complete,
 * standalone Markdown document (the page's full body content plus FAQ,
 * related pages, and data sources) — built fresh from structured data, so it
 * can never accidentally include nav/footer/script markup the way scraping
 * rendered HTML could.
 *
 * Both take an optional `locale` (issue #488, parent #438 §Q/§S) so a
 * `/en//ja//ko/` page's own llms.txt/markdown can translate these section
 * *headings* too — otherwise a page whose `LlmsPageContent` is entirely
 * localized (title/summary/FAQ/related labels) would still carry 3 hardcoded
 * zh headings, failing #488's "genuinely in that language, not Chinese"
 * acceptance criterion. Defaults to `"zh-TW"` so every existing zh-only call
 * site (every `app/(zh)/**` llms.txt/markdown route) is byte-for-byte
 * unchanged.
 */

const SECTION_HEADINGS: Record<Locale, { sources: string; related: string; faqs: string }> = {
  "zh-TW": { sources: "資料來源 (Data Sources)", related: "相關頁面 (Related Pages)", faqs: "常見問題 (FAQ)" },
  en: { sources: "Data Sources", related: "Related Pages", faqs: "Frequently Asked Questions (FAQ)" },
  ja: { sources: "データソース (Data Sources)", related: "関連ページ (Related Pages)", faqs: "よくある質問 (FAQ)" },
  ko: { sources: "데이터 출처 (Data Sources)", related: "관련 페이지 (Related Pages)", faqs: "자주 묻는 질문 (FAQ)" },
};

export interface LlmsPageLink {
  title: string;
  /** Full absolute URL. Omit only when there is genuinely no URL to link to
   * (e.g. a scientific reference with no official web page) — the item is
   * then rendered as plain text instead of a dangling/fake link. */
  url?: string;
  /** Optional short annotation shown after the link (e.g. an authority name
   * or a one-line note). */
  note?: string;
}

export interface LlmsPageFaq {
  question: string;
  answer: string;
}

export interface LlmsPageSection {
  heading: string;
  /** One or more markdown-ready paragraph/bullet blocks. Only rendered in
   * the full Markdown output, not llms.txt. */
  paragraphs: string[];
}

export interface LlmsPageContent {
  /** Becomes the `# Title` H1 in both outputs. */
  title: string;
  /** This page's own canonical absolute URL. */
  url: string;
  /** One-sentence direct-answer summary — becomes llms.txt's `> ` blockquote
   * and the full Markdown's opening paragraph. */
  summary: string;
  /** Authoritative data source(s) this page's content is drawn from. */
  sources?: LlmsPageLink[];
  /** Related pages for internal cross-linking. */
  related?: LlmsPageLink[];
  /** Structured FAQ entries. */
  faqs?: LlmsPageFaq[];
  /** Extra full-content sections (formula, reference tables, article body,
   * policy text, etc.) — included only in the full Markdown rendering. */
  sections?: LlmsPageSection[];
}

const renderLink = (link: LlmsPageLink): string => {
  const label = link.url ? `[${link.title}](${link.url})` : link.title;
  return link.note ? `${label}: ${link.note}` : label;
};

/**
 * Builds llms.txt-grammar text (https://llmstxt.org/) for a single page: an
 * H1, a one-line blockquote summary, then `##` sections for data sources,
 * related pages, and FAQ — every link rendered as a full absolute URL.
 */
export function buildLlmsTxt(content: LlmsPageContent, locale: Locale = "zh-TW"): string {
  const headings = SECTION_HEADINGS[locale];
  const lines: string[] = [`# ${content.title}`, "", `> ${content.summary}`];

  if (content.sources && content.sources.length > 0) {
    lines.push("", `## ${headings.sources}`);
    for (const source of content.sources) {
      lines.push(`- ${renderLink(source)}`);
    }
  }

  if (content.related && content.related.length > 0) {
    lines.push("", `## ${headings.related}`);
    for (const link of content.related) {
      lines.push(`- ${renderLink(link)}`);
    }
  }

  if (content.faqs && content.faqs.length > 0) {
    lines.push("", `## ${headings.faqs}`);
    for (const faq of content.faqs) {
      lines.push(`- Q: ${faq.question}`);
      lines.push(`  A: ${faq.answer}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Builds a clean, standalone full-page Markdown rendering of the same
 * `LlmsPageContent` — the page's title, summary, any extra `sections`
 * (article body / formula / reference table / policy text), FAQ, related
 * pages, and data sources. Contains no navigation, footer, or script
 * content because it is generated purely from structured data, never from
 * scraped HTML.
 */
export function buildLlmsMarkdown(content: LlmsPageContent, locale: Locale = "zh-TW"): string {
  const headings = SECTION_HEADINGS[locale];
  const lines: string[] = [`# ${content.title}`, "", content.summary];

  if (content.sections && content.sections.length > 0) {
    for (const section of content.sections) {
      lines.push("", `## ${section.heading}`);
      for (const paragraph of section.paragraphs) {
        lines.push("", paragraph);
      }
    }
  }

  if (content.faqs && content.faqs.length > 0) {
    lines.push("", `## ${headings.faqs}`);
    for (const faq of content.faqs) {
      lines.push("", `### ${faq.question}`, "", faq.answer);
    }
  }

  if (content.related && content.related.length > 0) {
    lines.push("", `## ${headings.related}`);
    for (const link of content.related) {
      lines.push(`- ${renderLink(link)}`);
    }
  }

  if (content.sources && content.sources.length > 0) {
    lines.push("", `## ${headings.sources}`);
    for (const source of content.sources) {
      lines.push(`- ${renderLink(source)}`);
    }
  }

  return `${lines.join("\n")}\n`;
}
