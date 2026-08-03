import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/long-term-care`;
const catalogEntry = getToolCatalogEntry("long-term-care");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["長照機構", "長期照顧", "長照2.0"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "長照機構查詢", description: "查詢全台長期照顧服務機構。", url: canonical },
};

export default function LongTermCarePage() {
  return (
    <ToolPageShell slug="long-term-care" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["long-term-care"]} />
    </ToolPageShell>
  );
}
