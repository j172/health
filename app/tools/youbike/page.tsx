import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import YoubikeContent from "@/components/Tools/YoubikeContent";
import { searchYouBikeStations } from "@/lib/server/youbike/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/youbike`;
const catalogEntry = getToolCatalogEntry("youbike");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "YouBike",
    "YouBike 2.0",
    "台北YouBike即時車位",
    "新北YouBike",
    "新竹YouBike",
    "微笑單車查詢",
    "自行車租借即時資訊",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default async function YoubikePage() {
  const initial = await searchYouBikeStations({ limit: 40 });

  return (
    <ToolPageShell slug="youbike" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <YoubikeContent initialStations={initial.stations} />
    </ToolPageShell>
  );
}
