import type { Metadata } from "next";
import { getBaseUrl, SITE_NAME } from "@/lib/server/news/seo";

const TOOLS_DESCRIPTION =
  "免費健康計算機與查詢工具：BMI、卡路里、體脂率、血壓、睡眠評估，以及全台醫療院所、藥局、藥品、長照機構查詢。";

export const metadata: Metadata = {
  title: { default: `健康工具與公衛資料庫 | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` },
  description: TOOLS_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `健康工具與公衛資料庫 | ${SITE_NAME}`,
    description: TOOLS_DESCRIPTION,
    locale: "zh_TW",
    alternateLocale: ["en_US"],
    images: [
      {
        url: `${getBaseUrl()}/images/og/tools.png`,
        width: 1200,
        height: 630,
        alt: "健康工具與公衛資料庫",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `健康工具與公衛資料庫 | ${SITE_NAME}`,
    description: TOOLS_DESCRIPTION,
    images: [`${getBaseUrl()}/images/og/tools.png`],
  },
};

export default function ToolsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
