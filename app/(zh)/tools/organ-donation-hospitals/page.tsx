import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/organ-donation-hospitals`;
const catalogEntry = getToolCatalogEntry("organ-donation-hospitals");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["器官捐贈", "器捐網絡責任醫院", "器捐意願簽署", "健保卡器捐註記", "大愛器捐", "安寧緩和醫療"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function OrganDonationHospitalsPage() {
  return (
    <ToolPageShell slug="organ-donation-hospitals" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["organ-donation-hospitals"]} />
    </ToolPageShell>
  );
}
