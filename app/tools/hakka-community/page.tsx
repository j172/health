import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/hakka-community`;
const catalogEntry = getToolCatalogEntry("hakka-community");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["客庄社區發展協會", "客家委員會", "社區照顧"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "客庄社區發展協會查詢", description: "查詢全台客庄社區發展協會。", url: canonical },
};

export default function HakkaCommunityPage() {
  return (
    <ToolPageShell slug="hakka-community" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["hakka-community"]} />
    </ToolPageShell>
  );
}
