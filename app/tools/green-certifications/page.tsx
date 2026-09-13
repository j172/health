import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GreenCertificationsContent from "./GreenCertificationsContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/green-certifications`;
const catalogEntry = getToolCatalogEntry("green-certifications");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "綠色商店",
    "環保標章旅館",
    "環保標章產品",
    "環保餐廳",
    "環境部認證",
    "綠色採購",
    "節能標章",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function GreenCertificationsPage() {
  return (
    <ToolPageShell
      slug="green-certifications"
      title={catalogEntry.title}
      maxWidthClassName="max-w-4xl"
    >
      <GreenCertificationsContent />
    </ToolPageShell>
  );
}
