import type { MetadataRoute } from "next";
import { listNewsForSitemap } from "@/lib/server/news/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import { TOOL_CATALOG, isToolIndexable } from "@/lib/server/tools/catalog";
import {
  buildHreflangAlternates,
  buildLocalizedPath,
  PATH_LOCALES,
  TRANSLATED_CANONICAL_PATHS,
} from "@/lib/i18n/translatedPages";

export const runtime = "nodejs";
export const revalidate = 3600;

// Google's single-sitemap ceiling is 50,000 URLs; this cap just needs to stay
// comfortably under that. If the archive ever grows past it, switch to a
// generateSitemaps() split (Next.js supports it) instead of raising this
// further — a single 20k-URL sitemap is already close to the practical
// crawl-budget-friendly limit.
const MAX_SITEMAP_ITEMS = 20_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const items = await listNewsForSitemap(MAX_SITEMAP_ITEMS);

  const newsEntries: MetadataRoute.Sitemap = items.map((item) => ({
    url: `${baseUrl}/news/${item.id}`,
    lastModified: item.published_at_utc
      ? new Date(item.published_at_utc)
      : undefined,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const sourceEntries: MetadataRoute.Sitemap = SOURCE_CATEGORIES.flatMap(
    (category) =>
      category.sources.map((source) => ({
        url: `${baseUrl}/news?source=${encodeURIComponent(source.sourceName)}`,
        changeFrequency: "hourly" as const,
        priority: 0.6,
      })),
  );

  // issue #485: a translated tool's zh entry now declares real `/en/`,
  // `/ja/`, `/ko/` alternates (via the same buildHreflangAlternates() the
  // page's own metadata uses, so the two can't drift); every other tool
  // gets no `languages` at all — not the broken `?lang=` ones this used to
  // emit — since it genuinely has no foreign-language version yet.
  const toolEntries: MetadataRoute.Sitemap = TOOL_CATALOG.filter(
    isToolIndexable,
  ).map((tool) => {
    const canonicalPath = `/tools/${tool.slug}`;
    const languages = buildHreflangAlternates(canonicalPath, baseUrl);
    return {
      url: `${baseUrl}${canonicalPath}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
      ...(languages ? { alternates: { languages } } : {}),
    };
  });

  // The /en/, /ja/, /ko/ sibling URLs themselves also need their own
  // sitemap entries (each with the same reciprocal alternates) — crawlers
  // discover a page's hreflang siblings fastest when every one of them is
  // independently listed, not only cross-referenced from the zh entry.
  const translatedLocaleEntries: MetadataRoute.Sitemap = TRANSLATED_CANONICAL_PATHS.flatMap(
    (canonicalPath) =>
      PATH_LOCALES.map((locale) => ({
        url: `${baseUrl}${buildLocalizedPath(canonicalPath, locale)}`,
        changeFrequency: "monthly" as const,
        priority: 0.6,
        alternates: { languages: buildHreflangAlternates(canonicalPath, baseUrl) ?? undefined },
      })),
  );

  return [
    { url: baseUrl, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/news`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/tools`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/llm-info`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    ...toolEntries,
    ...translatedLocaleEntries,
    ...sourceEntries,
    ...newsEntries,
  ];
}
