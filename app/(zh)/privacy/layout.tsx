import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/server/news/seo";

const PRIVACY_DESCRIPTION =
  "j172tw Healthz 隱私權政策：說明本站蒐集哪些資料、如何使用，並符合 GDPR、CCPA/CPRA、APPI、CBPR 與台灣個人資料保護法之揭露與使用者權利規範。";

export const metadata: Metadata = {
  title: { default: `隱私權政策 | ${SITE_NAME}`, template: `%s | ${SITE_NAME}` },
  description: PRIVACY_DESCRIPTION,
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

export default function PrivacyLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
