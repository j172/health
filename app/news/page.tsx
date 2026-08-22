import type { Metadata } from "next";
import { countNewsItems, listLatestNews } from "@/lib/server/news/queries";
import { buildNewsListJsonLd, getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import { SOURCE_CATEGORIES } from "@/lib/server/news/sourceCategories";
import StabloNewsLayout, { NEWS_PAGE_SIZE_OPTIONS, DEFAULT_NEWS_PAGE_SIZE } from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const resolvePageSize = (sizeParam?: string): number => {
  const requested = Number(sizeParam);
  return (NEWS_PAGE_SIZE_OPTIONS as readonly number[]).includes(requested) ? requested : DEFAULT_NEWS_PAGE_SIZE;
};

type NewsPageSearchParams = { page?: string; source?: string; keyword?: string; group?: string; size?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<NewsPageSearchParams> }): Promise<Metadata> {
  const { page: pageParam, source, keyword: keywordParam, group: groupParam, size: sizeParam } = await searchParams;
  const sourceName = source?.trim() || undefined;
  const keyword = keywordParam?.trim() || undefined;
  const group = !sourceName ? SOURCE_CATEGORIES.find((c) => c.key === groupParam?.trim()) : undefined;
  const requestedPage = Number(pageParam);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = resolvePageSize(sizeParam);
  const sourceLabel = sourceName ? resolveAuthorLabel({ dept_name: null, source_name: sourceName, feed_name: sourceName }) : null;

  const title = keyword ? `#${keyword} 相關新聞` : sourceLabel ? `${sourceLabel}新聞` : group ? `${group.label}新聞` : "最新新聞";
  const description = keyword
    ? `包含關鍵字「${keyword}」的新聞。`
    : sourceLabel
      ? `彙整${sourceLabel}公告與報導，掌握最新動態。`
      : group
        ? `彙整${group.label}分類下所有來源的公告與報導，掌握最新動態。`
        : SITE_DESCRIPTION;
  const baseUrl = getBaseUrl();
  const canonicalPath = keyword
    ? `/news?keyword=${encodeURIComponent(keyword)}`
    : sourceName
      ? `/news?source=${encodeURIComponent(sourceName)}`
      : group
        ? `/news?group=${encodeURIComponent(group.key)}`
        : "/news";
  const canonical = `${baseUrl}${canonicalPath}`;

  return {
    title,
    description,
    alternates: { canonical },
    // Paginated/filtered archive views are near-duplicates of page 1 — keep
    // them crawlable (follow) but out of the index to avoid diluting the
    // canonical /news listing with near-identical indexed pages. Keyword
    // pages are open-ended (one per AI-generated tag, potentially
    // thousands) rather than the fixed curated source list, so keep those
    // out of the index entirely to avoid a flood of thin near-duplicate
    // pages.
    robots:
      keyword || currentPage > 1 || pageSize !== DEFAULT_NEWS_PAGE_SIZE
        ? { index: false, follow: true }
        : {
            index: true,
            follow: true,
            googleBot: {
              index: true,
              follow: true,
              "max-video-preview": -1,
              "max-image-preview": "large",
              "max-snippet": -1,
            },
          },
    openGraph: {
      type: "website",
      title: `${title} | ${SITE_NAME}`,
      description,
      url: canonical,
      siteName: SITE_NAME,
      locale: "zh_TW",
    },
  };
}

export default async function NewsPage({ searchParams }: { searchParams: Promise<NewsPageSearchParams> }) {
  const { page: pageParam, source, keyword: keywordParam, group: groupParam, size: sizeParam } = await searchParams;
  const requestedPage = Number(pageParam);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = resolvePageSize(sizeParam);
  const sourceName = source?.trim() || undefined;
  const keyword = keywordParam?.trim() || undefined;
  // A specific source (drill-down) always wins over the coarser group filter.
  const group = !sourceName ? SOURCE_CATEGORIES.find((c) => c.key === groupParam?.trim()) : undefined;
  const groupKey = group?.key;
  const sourceNames = group?.sources.map((s) => s.sourceName);

  const [items, total] = await Promise.all([
    listLatestNews(pageSize, (currentPage - 1) * pageSize, sourceName, keyword, sourceNames),
    countNewsItems(sourceName, keyword, sourceNames),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sourceLabel = sourceName ? resolveAuthorLabel({ dept_name: null, source_name: sourceName, feed_name: sourceName }) : null;
  const archiveTitle = keyword ? `#${keyword}` : (sourceLabel ?? group?.label);
  const archiveDescription = keyword
    ? `包含關鍵字「${keyword}」的新聞。`
    : group && !sourceName
      ? `彙整${group.label}分類下所有來源的公告與報導。`
      : undefined;
  const jsonLd = buildNewsListJsonLd(
    items,
    keyword ? `#${keyword} 相關新聞` : sourceLabel ? `${sourceLabel}新聞` : group ? `${group.label}新聞` : "最新新聞",
  );

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StabloNewsLayout
        items={items}
        variant="archive"
        pagination={{ currentPage, totalPages, pageSize, sourceName, keyword, group: groupKey }}
        archiveTitle={archiveTitle}
        archiveDescription={archiveDescription}
        activeGroupKey={groupKey}
      />
    </>
  );
}
