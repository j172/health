import type { LlmsPageContent, LlmsPageLink } from "./llmsPage";
import type { PathLocale } from "@/lib/i18n/dictionary";
import { getLocalizedPageMeta } from "@/lib/i18n/pageContent";
import { getLocalizedGuideMeta } from "@/lib/i18n/guideContent";
import { getLocalizedToolMeta } from "@/lib/i18n/toolContent";
import { buildLocalizedPath, TRANSLATED_TOOL_SLUGS } from "@/lib/i18n/translatedPages";

/**
 * Builds the shared `LlmsPageContent` for a `/{locale}` (/en//ja//ko/)
 * homepage — issue #488, parent #438 §Q/§S.
 *
 * The zh homepage (`app/(zh)/(site)/page.tsx`) has no per-page llms.txt of
 * its own: it's covered instead by the sitewide `/llms.txt` and
 * `/llms-full.txt` indexes (`app/llms.txt/route.ts`), which list every one
 * of TOOL_CATALOG's ~80 zh tool pages. A locale homepage can't reuse that
 * same index, though — most of those tools have no `/{locale}/tools/<slug>`
 * page at all, so a straight translation of the sitewide index would dangle
 * ~60 links that 404 in that language. Instead this scopes the index to
 * exactly what TRANSLATED_PAGES says actually exists in `locale`: every
 * `TRANSLATED_TOOL_SLUGS` entry plus the translated standalone pages
 * ("/nearby", the "typhoon-earthquake" guide) — each with its own real
 * localized title, resolved the same way `GuideCardsSection`/
 * `RecentToolsSection` resolve labels on the visible homepage itself.
 */
export function buildLocaleHomeLlmsPageContent(locale: PathLocale, baseUrl: string): LlmsPageContent {
  const meta = getLocalizedPageMeta("home", locale);
  const url = `${baseUrl}${buildLocalizedPath("/", locale)}`;

  const related: LlmsPageLink[] = [
    {
      title: getLocalizedPageMeta("nearby", locale).title,
      url: `${baseUrl}${buildLocalizedPath("/nearby", locale)}`,
    },
    {
      title: getLocalizedGuideMeta("typhoon-earthquake", locale).title,
      url: `${baseUrl}${buildLocalizedPath("/guides/typhoon-earthquake", locale)}`,
    },
    ...TRANSLATED_TOOL_SLUGS.map((slug) => ({
      title: getLocalizedToolMeta(slug, locale).title,
      url: `${baseUrl}${buildLocalizedPath(`/tools/${slug}`, locale)}`,
    })),
  ];

  return {
    title: meta.title,
    url,
    summary: meta.description,
    related,
  };
}
