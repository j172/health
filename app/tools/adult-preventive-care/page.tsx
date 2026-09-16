import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/adult-preventive-care`;
const catalogEntry = getToolCatalogEntry("adult-preventive-care");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["成人健檢", "免費癌症篩檢", "四癌篩檢", "子宮頸抹片", "乳房攝影", "糞便潛血檢查", "口腔黏膜檢查"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function AdultPreventiveCarePage() {
  return (
    <ToolPageShell slug="adult-preventive-care" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["adult-preventive-care"]} />
    </ToolPageShell>
  );
}
