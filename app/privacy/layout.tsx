import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { buildOrganizationJsonLd, buildWebsiteJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";
import PrivacyConsentBanner from "@/components/Legal/PrivacyConsentBanner";
import RegisterServiceWorker from "@/components/Pwa/RegisterServiceWorker";

const inter = Inter({ subsets: ["latin"] });

const PRIVACY_DESCRIPTION = "j172tw Health 隱私權政策：說明本站蒐集哪些資料、如何使用，並符合 GDPR、CCPA/CPRA、APPI、CBPR 與台灣個人資料保護法之揭露與使用者權利規範。";

export const viewport: Viewport = {
  themeColor: "#006bff",
};

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: `隱私權政策 | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` },
  description: PRIVACY_DESCRIPTION,
  icons: { icon: "/images/favicon.ico", apple: "/images/icon/pwa-192.png" },
  appleWebApp: { capable: true, title: "j172tw Health", statusBarStyle: "default" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `隱私權政策 | ${SITE_NAME}`,
    description: PRIVACY_DESCRIPTION,
    locale: "zh_TW",
  },
  twitter: {
    card: "summary_large_image",
    title: `隱私權政策 | ${SITE_NAME}`,
    description: PRIVACY_DESCRIPTION,
  },
};

export default function PrivacyRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
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
