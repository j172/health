import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { buildOrganizationJsonLd, buildWebsiteJsonLd, getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";

const inter = Inter({ subsets: ["latin"] });

const TOOLS_DESCRIPTION = "免費健康計算機與查詢工具：BMI、卡路里、體脂率、血壓、睡眠評估，以及全台醫療院所、藥局、藥品、長照機構查詢。";

export const metadata: Metadata = {
  metadataBase: new URL(getBaseUrl()),
  title: { default: `健康工具 | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` },
  description: TOOLS_DESCRIPTION,
  icons: { icon: "/images/favicon.ico" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `健康工具 | ${SITE_NAME}`,
    description: TOOLS_DESCRIPTION,
    locale: "zh_TW",
  },
  twitter: {
    card: "summary_large_image",
    title: `健康工具 | ${SITE_NAME}`,
    description: TOOLS_DESCRIPTION,
  },
};

export default function ToolsRootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body className={inter.className}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildOrganizationJsonLd()) }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildWebsiteJsonLd()) }} />
        {children}
      </body>
    </html>
  );
}
