import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { buildOrganizationJsonLd, buildWebsiteJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import PrivacyConsentBanner from "@/components/Legal/PrivacyConsentBanner";
import RegisterServiceWorker from "@/components/Pwa/RegisterServiceWorker";
import Provider from "../(site)/Provider";

const inter = Inter({ subsets: ["latin"] });

const TOOLS_DESCRIPTION = "免費健康計算機與查詢工具：BMI、卡路里、體脂率、血壓、睡眠評估，以及全台醫療院所、藥局、藥品、長照機構查詢。";

export const viewport: Viewport = {
  themeColor: "#625df5",
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: `健康工具與公衛資料庫 | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` },
  description: TOOLS_DESCRIPTION,
  icons: { icon: "/images/favicon.ico", apple: "/images/icon/pwa-192.png" },
  appleWebApp: { capable: true, title: "j172tw Healthz", statusBarStyle: "default" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `健康工具與公衛資料庫 | ${SITE_NAME}`,
    description: TOOLS_DESCRIPTION,
    locale: "zh_TW",
    alternateLocale: ["zh_CN", "en_US"],
    images: [{ url: `${getBaseUrl()}/images/og/tools.png`, width: 1200, height: 630, alt: "健康工具與公衛資料庫" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `健康工具與公衛資料庫 | ${SITE_NAME}`,
    description: TOOLS_DESCRIPTION,
    images: [`${getBaseUrl()}/images/og/tools.png`],
  },
};

export default function ToolsRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME} - 最新公衛新聞 (RSS 2.0)`} href="/feed.xml" />
        <link rel="alternate" type="text/plain" href="/llms.txt" title="LLMs.txt Index" />
        <link rel="alternate" type="text/plain" href="/llms-full.txt" title="LLMs Full Knowledge Base" />
      </head>
      <body className={inter.className}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationJsonLd()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebsiteJsonLd()) }} />
        <Provider>{children}</Provider>
        <PrivacyConsentBanner />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
