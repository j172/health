import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/sheltered-workshops`;
const catalogEntry = getToolCatalogEntry("sheltered-workshops");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["庇護工場", "身心障礙就業", "身障手作", "公益禮盒", "勞動部開放資料", "烘焙伴手禮"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function ShelteredWorkshopsPage() {
  return (
    <ToolPageShell slug="sheltered-workshops" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["sheltered-workshops"]} />
    </ToolPageShell>
  );
}
