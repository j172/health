import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CarbonFootprintCoefficientsContent from "./CarbonFootprintCoefficientsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/carbon-footprint-coefficients`;
const catalogEntry = getToolCatalogEntry("carbon-footprint-coefficients");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["碳足跡係數", "排放係數", "溫室氣體排放係數", "環境部", "淨零", "碳盤查"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function CarbonFootprintCoefficientsPage() {
  return (
    <ToolPageShell slug="carbon-footprint-coefficients" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <CarbonFootprintCoefficientsContent />
    </ToolPageShell>
  );
}
