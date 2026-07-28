import type { Metadata } from "next";
import { countNewsItems, listLatestNews } from "@/lib/server/news/queries";
import { buildNewsListJsonLd, getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_SIZE = 50;

type NewsPageSearchParams = { page?: string; source?: string; keyword?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<NewsPageSearchParams> }): Promise<Metadata> {
  const { page: pageParam, source, keyword: keywordParam } = await searchParams;
  const sourceName = source?.trim() || undefined;
  const keyword = keywordParam?.trim() || undefined;
  const requestedPage = Number(pageParam);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const sourceLabel = sourceName ? resolveAuthorLabel({ dept_name: null, source_name: sourceName, feed_name: sourceName }) : null;

  const title = keyword ? `#${keyword} 相關新聞` : sourceLabel ? `${sourceLabel}新聞` : "最新新聞";
  const description = keyword
    ? `包含關鍵字「${keyword}」的新聞。`
    : sourceLabel
      ? `彙整${sourceLabel}公告與報導，掌握最新動態。`
      : SITE_DESCRIPTION;
  const baseUrl = getBaseUrl();
  const canonicalPath = keyword
    ? `/news?keyword=${encodeURIComponent(keyword)}`
    : sourceName
      ? `/news?source=${encodeURIComponent(sourceName)}`
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
    robots: keyword || currentPage > 1 ? { index: false, follow: true } : { index: true, follow: true },
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
  const { page: pageParam, source, keyword: keywordParam } = await searchParams;
  const requestedPage = Number(pageParam);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const sourceName = source?.trim() || undefined;
  const keyword = keywordParam?.trim() || undefined;

  const [items, total] = await Promise.all([
    listLatestNews(PAGE_SIZE, (currentPage - 1) * PAGE_SIZE, sourceName, keyword),
    countNewsItems(sourceName, keyword),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sourceLabel = sourceName ? resolveAuthorLabel({ dept_name: null, source_name: sourceName, feed_name: sourceName }) : null;
  const archiveTitle = keyword ? `#${keyword}` : (sourceLabel ?? undefined);
  const archiveDescription = keyword ? `包含關鍵字「${keyword}」的新聞。` : undefined;
  const jsonLd = buildNewsListJsonLd(items, keyword ? `#${keyword} 相關新聞` : sourceLabel ? `${sourceLabel}新聞` : "最新新聞");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StabloNewsLayout
        items={items}
        variant="archive"
        pagination={{ currentPage, totalPages, sourceName, keyword }}
        archiveTitle={archiveTitle}
        archiveDescription={archiveDescription}
      />
    </>
  );
}
