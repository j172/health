import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/rare-disease-care`;
const catalogEntry = getToolCatalogEntry("rare-disease-care");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["罕見疾病", "罕病照護諮詢中心", "遺傳諮詢", "罕病確診醫院", "重大傷病卡", "罕病用藥補助"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function RareDiseaseCarePage() {
  return (
    <ToolPageShell slug="rare-disease-care" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["rare-disease-care"]} />
    </ToolPageShell>
  );
}
