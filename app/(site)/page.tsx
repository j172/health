import type { Metadata } from "next";
import { listDiverseHomeNews } from "@/lib/server/news/queries";
import { buildHomeGraphJsonLd, getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import StabloNewsLayout from "@/components/News/StabloNewsLayout";
import HomeStatusBar from "@/components/Home/HomeStatusBar";
import GuideCardsSection from "@/components/Home/GuideCardsSection";
import RecentToolsSection from "@/components/Home/RecentToolsSection";

export const revalidate = 60;
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
  const items = await listDiverseHomeNews(30, 3);
  const homeGraph = buildHomeGraphJsonLd(items);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeGraph) }} />
      <StabloNewsLayout
        items={items}
        variant="home"
        homeTopSections={
          <>
            {/* 首頁改版 (issue #472，母票 #438 §G)：定位感知狀態列、5 張生活情
             * 境卡、最近使用的工具，依序排在焦點新聞與新聞列表之上。
             * HomeStatusBar / RecentToolsSection 是 "use client" 元件，各自
             * 在瀏覽器端才抓資料（定位、/api/home-status、localStorage），
             * 不影響這個 Server Component 本身沿用的 60 秒 ISR 快取。 */}
            <HomeStatusBar />
            <GuideCardsSection />
            <RecentToolsSection />
          </>
        }
      />
    </>
  );
}
