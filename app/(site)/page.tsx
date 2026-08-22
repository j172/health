import type { Metadata } from "next";
import { listLatestNews } from "@/lib/server/news/queries";
import { buildNewsListJsonLd, getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  title: SITE_NAME,
  description: SITE_DESCRIPTION,
  alternates: { canonical: getBaseUrl() },
  robots: {
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
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: getBaseUrl(),
    siteName: SITE_NAME,
    locale: "zh_TW",
    images: [{ url: `${getBaseUrl()}/images/og/home.png`, width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [`${getBaseUrl()}/images/og/home.png`],
  },
};

export default async function Home() {
  const items = await listLatestNews(53);
  const jsonLd = buildNewsListJsonLd(items, "最新新聞");

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <StabloNewsLayout items={items} variant="home" />
    </>
  );
}
