import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AccessibleTransitContent from "@/components/Tools/AccessibleTransitContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/accessible-transit`;
const catalogEntry = getToolCatalogEntry("accessible-transit");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "無障礙交通",
    "低地板公車",
    "低底盤公車比率",
    "捷運無障礙電梯",
    "台鐵愛心渡板",
    "台灣高鐵輪椅席",
    "復康巴士預約專線",
    "通用計程車",
    "輪椅出門",
    "長照交通接送",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function AccessibleTransitPage() {
  return (
    <ToolPageShell slug="accessible-transit" title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <AccessibleTransitContent />
    </ToolPageShell>
  );
}
