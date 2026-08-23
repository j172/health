import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/child-safety-spots`;
const catalogEntry = getToolCatalogEntry("child-safety-spots");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["婦幼安全", "婦幼警示點", "治安顧慮場所", "警政署", "兒童安全", "婦女安全"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "婦幼安全警示地點查詢", description: "查詢警政署公告之全國婦幼安全警示路段與管轄警方窗口。", url: canonical },
};

export default function ChildSafetySpotsPage() {
  return (
    <ToolPageShell slug="child-safety-spots" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["child-safety-spots"]} />
    </ToolPageShell>
  );
}
