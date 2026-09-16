import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/home-emergency-care`;
const catalogEntry = getToolCatalogEntry("home-emergency-care");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["在宅急症照護", "在宅醫療", "健保試辦計畫", "抗生素在宅施打", "遠距生理監控", "高齡在家住院"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function HomeEmergencyCarePage() {
  return (
    <ToolPageShell slug="home-emergency-care" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["home-emergency-care"]} />
    </ToolPageShell>
  );
}
