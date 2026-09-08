import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WaterLevelStationsContent from "./WaterLevelStationsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/water-level-stations`;
const catalogEntry = getToolCatalogEntry("water-level-stations");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["水位站", "河川水位", "地下水位", "水利署", "即時水位", "防汛"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function WaterLevelStationsPage() {
  return (
    <ToolPageShell slug="water-level-stations" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <WaterLevelStationsContent />
    </ToolPageShell>
  );
}
