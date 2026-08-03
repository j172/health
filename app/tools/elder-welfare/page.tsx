import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/elder-welfare`;
const catalogEntry = getToolCatalogEntry("elder-welfare");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["老人福利機構", "安養機構", "養護機構", "衛福部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "老人福利機構查詢", description: "查詢全台老人福利機構。", url: canonical },
};

export default function ElderWelfarePage() {
  return (
    <ToolPageShell slug="elder-welfare" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["elder-welfare"]} />
    </ToolPageShell>
  );
}
