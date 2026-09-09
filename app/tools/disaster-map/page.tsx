import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import DisasterMapContent from "@/components/DisasterMap/DisasterMapContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/disaster-map`;
const catalogEntry = getToolCatalogEntry("disaster-map");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["防災地圖", "避難收容處所", "消防救援單位", "應變中心", "內政部", "防災", "避難地圖"],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function DisasterMapPage() {
  return (
    <ToolPageShell slug="disaster-map" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <DisasterMapContent />
    </ToolPageShell>
  );
}
