import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import HeritageMapContent from "@/components/HeritageMap/HeritageMapContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/heritage-map`;
const catalogEntry = getToolCatalogEntry("heritage-map");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["文化資產地圖", "古蹟", "歷史建築", "考古遺址", "文化部", "文化資產局", "BOCH"],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function HeritageMapPage() {
  return (
    <ToolPageShell slug="heritage-map" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <HeritageMapContent />
    </ToolPageShell>
  );
}
