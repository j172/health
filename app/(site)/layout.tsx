import { Inter } from "next/font/google";
import "../globals.css";
import type { Metadata, Viewport } from "next";
import Provider from "./Provider";
import { buildOrganizationJsonLd, buildWebsiteJsonLd, getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import PrivacyConsentBanner from "@/components/Legal/PrivacyConsentBanner";
import RegisterServiceWorker from "@/components/Pwa/RegisterServiceWorker";
import GoogleTag from "@/components/Analytics/GoogleTag";

const inter = Inter({ subsets: ["latin"], display: "swap", fallback: ["system-ui", "sans-serif"] });

export const viewport: Viewport = {
  themeColor: "#625df5",
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  icons: { icon: "/images/favicon.ico", apple: "/images/icon/pwa-192.png" },
  appleWebApp: { capable: true, title: "j172tw Healthz", statusBarStyle: "default" },
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
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "zh_TW",
    alternateLocale: ["zh_CN", "en_US"],
    images: [{ url: `${getBaseUrl()}/images/og/home.png`, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [`${getBaseUrl()}/images/og/home.png`],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant-TW" suppressHydrationWarning>
      <head>
        <link rel="alternate" type="application/rss+xml" title={`${SITE_NAME} - 最新公衛與健康新聞 (RSS 2.0)`} href="/feed.xml" />
        <link rel="alternate" type="text/plain" title={`${SITE_NAME} - LLM / AI Index (llms.txt)`} href="/llms.txt" />
      </head>
      <body className={`dark:bg-black ${inter.className}`}>
        <GoogleTag />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationJsonLd()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebsiteJsonLd()) }} />
        <Provider>{children}</Provider>
        <PrivacyConsentBanner />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
