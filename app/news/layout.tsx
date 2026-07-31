import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { buildOrganizationJsonLd, buildWebsiteJsonLd, getBaseUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/server/news/seo";
import PrivacyConsentBanner from "@/components/Legal/PrivacyConsentBanner";
import RegisterServiceWorker from "@/components/Pwa/RegisterServiceWorker";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#625df5",
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  icons: { icon: "/images/favicon.ico", apple: "/images/icon/pwa-192.png" },
  appleWebApp: { capable: true, title: "j172tw Healthz", statusBarStyle: "default" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "zh_TW",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
};

export default function NewsRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className={inter.className}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationJsonLd()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebsiteJsonLd()) }} />
        {children}
        <PrivacyConsentBanner />
        <RegisterServiceWorker />
      </body>
    </html>
  );
}