import type { Metadata } from "next";
import { countNewsItems, listLatestNews } from "@/lib/server/news/queries";
import { buildNewsListJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_SIZE = 50;

type NewsPageSearchParams = { page?: string; source?: string };

export async function generateMetadata({ searchParams }: { searchParams: Promise<NewsPageSearchParams> }): Promise<Metadata> {
  const { page: pageParam, source } = await searchParams;
  const sourceName = source?.trim() || undefined;
  const requestedPage = Number(pageParam);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const sourceLabel = sourceName ? resolveAuthorLabel({ dept_name: null, source_name: sourceName, feed_name: sourceName }) : null;

  const title = sourceLabel ? `${sourceLabel}健康新聞` : "最新健康新聞";
  const description = sourceLabel
    ? `彙整${sourceLabel}公告與報導的健康新聞，掌握最新動態。`
    : "彙整衛生福利部及各署即時公告，掌握最新健康與醫療新聞。";
  const baseUrl = getBaseUrl();
  const canonicalPath = sourceName ? `/news?source=${encodeURIComponent(sourceName)}` : "/news";
  const canonical = `${baseUrl}${canonicalPath}`;

  return {
    title,
    description,
    alternates: { canonical },
    // Paginated/filtered archive views are near-duplicates of page 1 — keep
    // them crawlable (follow) but out of the index to avoid diluting the
    // canonical /news listing with near-identical indexed pages.
    robots: currentPage > 1 ? { index: false, follow: true } : { index: true, follow: true },
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
  const { page: pageParam, source } = await searchParams;
  const requestedPage = Number(pageParam);
  const currentPage = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const sourceName = source?.trim() || undefined;

  const [items, total] = await Promise.all([
    listLatestNews(PAGE_SIZE, (currentPage - 1) * PAGE_SIZE, sourceName),
    countNewsItems(sourceName),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sourceLabel = sourceName ? resolveAuthorLabel({ dept_name: null, source_name: sourceName, feed_name: sourceName }) : null;
  const jsonLd = buildNewsListJsonLd(items, sourceLabel ? `${sourceLabel}健康新聞` : "最新健康新聞");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StabloNewsLayout
        items={items}
        variant="archive"
        pagination={{ currentPage, totalPages, sourceName }}
        archiveTitle={sourceLabel ?? undefined}
      />
    </>
  );
}
