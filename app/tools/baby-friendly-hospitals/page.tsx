import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/baby-friendly-hospitals`;
const catalogEntry = getToolCatalogEntry("baby-friendly-hospitals");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["母嬰親善醫療院所", "母嬰同室", "母乳哺育", "婦幼醫院", "國際泌乳顧問", "婦產科診所"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function BabyFriendlyHospitalsPage() {
  return (
    <ToolPageShell slug="baby-friendly-hospitals" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["baby-friendly-hospitals"]} />
    </ToolPageShell>
  );
}
