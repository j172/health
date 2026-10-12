import { isGovSource } from "@/lib/server/news/sourceCategories";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { stripHtml } from "@/lib/format/news";
import type { LlmsPageContent } from "./llmsPage";

export interface NewsLlmsPageInput {
  id: number;
  title: string;
  source_name: string;
  feed_name: string;
  dept_name: string | null;
  canonical_url: string;
  detail_html: string | null;
  description_html: string | null;
  meta_description: string | null;
  geo_summary: string | null;
  published_at_utc: Date | string | null;
  display_at_utc?: Date | string | null;
}

/**
 * Builds the shared `LlmsPageContent` shape for a `/news/<id>` article page —
 * but only for official (government-source) articles. Issue #444's "新聞內頁
 * （僅官方新聞）" requirement: this site aggregates third-party media
 * articles it has no rights/authority to represent as its own machine-readable
 * content, so a non-official source returns `null` and the caller (the
 * llms.txt/markdown route) must respond 404 instead of generating a page.
 *
 * Gating reuses the exact same `isGovSource` check
 * app/news/[id]/page.tsx already applies to decide whether to redirect to the
 * original article instead of rendering this site's own detail page — so the
 * two can't disagree about which articles are "official".
 */
export function buildNewsLlmsPageContent(
  news: NewsLlmsPageInput,
  baseUrl: string,
): LlmsPageContent | null {
  if (!isGovSource(news.source_name)) {
    return null;
  }

  const url = `${baseUrl}/news/${news.id}`;
  const authorLabel = resolveAuthorLabel(news);
  const summary =
    news.geo_summary?.trim() || news.meta_description?.trim() || news.title;

  const bodyText = stripHtml(news.detail_html || news.description_html);

  return {
    title: news.title,
    url,
    summary,
    sources: [
      {
        title: `${authorLabel}（原始公告）`,
        url: news.canonical_url || undefined,
        note: news.feed_name,
      },
    ],
    sections: bodyText
      ? [
          {
            heading: "全文內容",
            paragraphs: [bodyText],
          },
        ]
      : [],
    related: [{ title: "最新公衛新聞", url: `${baseUrl}/news` }],
    faqs: [],
  };
}
