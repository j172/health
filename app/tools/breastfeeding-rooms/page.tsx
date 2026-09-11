import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import BreastfeedingMapContent from "@/components/BreastfeedingRooms/BreastfeedingMapContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/breastfeeding-rooms`;
const catalogEntry = getToolCatalogEntry("breastfeeding-rooms");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "哺集乳室",
    "哺集乳室查詢",
    "育兒設施",
    "公共場所母乳哺育條例",
    "國民健康署",
    "母乳哺育",
    "依法設置哺集乳室",
    "自願設置哺集乳室",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function BreastfeedingRoomsPage() {
  return (
    <ToolPageShell slug="breastfeeding-rooms" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <BreastfeedingMapContent />
    </ToolPageShell>
  );
}
