import type { Metadata } from "next";
import { countNewsItems, listLatestNews } from "@/lib/server/news/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import { resolveAuthorLabel } from "@/lib/server/news/sourceLabels";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PAGE_SIZE = 50;

export const metadata: Metadata = {
  title: "最新健康新聞 | j172tw Health",
  description: "彙整衛生福利部及各署即時公告，掌握最新健康與醫療新聞。",
  alternates: { canonical: `${getBaseUrl()}/news` },
  openGraph: {
    type: "website",
    title: "最新健康新聞 | j172tw Health",
    description: "彙整衛生福利部及各署即時公告，掌握最新健康與醫療新聞。",
    url: `${getBaseUrl()}/news`,
    siteName: "j172tw Health",
    locale: "zh_TW",
  },
};

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ page?: string; source?: string }> }) {
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

  return (
    <StabloNewsLayout
      items={items}
      variant="archive"
      pagination={{ currentPage, totalPages, sourceName }}
      archiveTitle={sourceLabel ?? undefined}
    />
  );
}
