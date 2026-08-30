import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import PublicArtContent from "@/components/Activities/PublicArtContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/public-art`;
const catalogEntry = getToolCatalogEntry("public-art");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["公共藝術", "文化部", "藝術地圖", "裝置藝術", "雕塑", "公共設施地標"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function PublicArtPage() {
  return (
    <ToolPageShell slug="public-art" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <PublicArtContent />
    </ToolPageShell>
  );
}

