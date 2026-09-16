import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/hearing-aid-subsidies`;
const catalogEntry = getToolCatalogEntry("hearing-aid-subsidies");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["助聽器評估", "身心障礙輔具補助", "聽力檢查", "純音聽力測驗", "助聽器選配", "社家署特約院所"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function HearingAidSubsidiesPage() {
  return (
    <ToolPageShell slug="hearing-aid-subsidies" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["hearing-aid-subsidies"]} />
    </ToolPageShell>
  );
}
