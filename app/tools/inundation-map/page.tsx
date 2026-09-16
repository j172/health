import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import InundationMapContent from "@/components/Tools/InundationMapContent";

export const revalidate = 180;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/inundation-map`;
const catalogEntry = getToolCatalogEntry("inundation-map");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "路面淹水感測器",
    "積淹水即時地圖",
    "水利署IoT感測",
    "地下道淹水",
    "水利署河川警戒",
    "颱風豪雨淹水避難",
    "避難收容處所",
    "涉水行車安全",
    "防汛水情",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function InundationMapPage() {
  return (
    <ToolPageShell slug="inundation-map" title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <InundationMapContent />
    </ToolPageShell>
  );
}
