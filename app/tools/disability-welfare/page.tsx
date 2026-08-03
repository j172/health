import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/disability-welfare`;
const catalogEntry = getToolCatalogEntry("disability-welfare");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["身心障礙福利機構", "身障機構查詢", "衛福部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "身心障礙福利機構查詢", description: "查詢全台身心障礙福利機構。", url: canonical },
};

export default function DisabilityWelfarePage() {
  return (
    <ToolPageShell slug="disability-welfare" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["disability-welfare"]} />
    </ToolPageShell>
  );
}
