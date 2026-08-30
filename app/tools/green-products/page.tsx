import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import GreenProductsContent from "./GreenProductsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/green-products`;
const catalogEntry = getToolCatalogEntry("green-products");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["環保標章產品", "綠色商品", "節能標章", "環境部", "減碳", "環保採購"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function GreenProductsPage() {
  return (
    <ToolPageShell slug="green-products" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <GreenProductsContent />
    </ToolPageShell>
  );
}

