import type { Metadata } from "next";
import { listLatestNews } from "@/lib/server/news/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

export default async function NewsPage() {
  const items = await listLatestNews(48);
  return <StabloNewsLayout items={items} variant="archive" />;
}