import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CarbonFootprintProductsContent from "./CarbonFootprintProductsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/carbon-footprint-products`;
const catalogEntry = getToolCatalogEntry("carbon-footprint-products");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["產品碳足跡", "碳標籤", "碳足跡標籤", "環境部", "減碳", "淨零"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function CarbonFootprintProductsPage() {
  return (
    <ToolPageShell slug="carbon-footprint-products" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <CarbonFootprintProductsContent />
    </ToolPageShell>
  );
}
