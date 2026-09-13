import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CarbonFootprintContent from "./CarbonFootprintContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/carbon-footprint`;
const catalogEntry = getToolCatalogEntry("carbon-footprint");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "產品碳足跡",
    "碳足跡標籤",
    "碳足跡排放係數",
    "環境部",
    "減碳",
    "溫室氣體",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function CarbonFootprintPage() {
  return (
    <ToolPageShell
      slug="carbon-footprint"
      title={catalogEntry.title}
      maxWidthClassName="max-w-4xl"
    >
      <CarbonFootprintContent />
    </ToolPageShell>
  );
}
