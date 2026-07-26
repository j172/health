import type { Metadata } from "next";
import { listLatestNews } from "@/lib/server/news/queries";
import { buildNewsListJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE_DESCRIPTION = "彙整衛生福利部及各署即時公告、主要新聞媒體健康版面，提供繁體中文健康與醫療新聞總覽。";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: { canonical: getBaseUrl() },
  openGraph: {
    type: "website",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: getBaseUrl(),
    siteName: SITE_NAME,
    locale: "zh_TW",
  },
};

export default async function Home() {
  const items = await listLatestNews(30);
  const jsonLd = buildNewsListJsonLd(items, "最新健康新聞");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StabloNewsLayout items={items} variant="home" />
    </>
  );
}
