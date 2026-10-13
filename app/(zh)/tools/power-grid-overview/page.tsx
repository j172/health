import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import PowerGridOverviewContent from "@/components/Tools/PowerGridOverviewContent";
import { getGenerationUnits, getGenerationMix, getRadiationStations } from "@/lib/server/power/queries";

export const revalidate = 60;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/power-grid-overview`;
const catalogEntry = getToolCatalogEntry("power-grid-overview");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["台電", "即時電力", "發電量", "電源配比", "核電廠輻射監測", "能源署", "電力儀表板"],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default async function PowerGridOverviewPage() {
  const [units, mix, radiationStations] = await Promise.all([
    getGenerationUnits(),
    getGenerationMix(),
    getRadiationStations(),
  ]);

  return (
    <ToolPageShell slug="power-grid-overview" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <PowerGridOverviewContent
        initialUnits={units}
        initialMix={mix}
        initialRadiationStations={radiationStations}
      />
    </ToolPageShell>
  );
}
