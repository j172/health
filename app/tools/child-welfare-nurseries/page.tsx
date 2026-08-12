import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/child-welfare-nurseries`;
const catalogEntry = getToolCatalogEntry("child-welfare-nurseries");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["全國親子館", "托育資源中心", "親子館查詢", "育兒資源", "衛福部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "全國親子館查詢", description: "查詢全國親子館（托育資源中心）名冊。", url: canonical },
};

export default function ChildWelfareNurseriesPage() {
  return (
    <ToolPageShell slug="child-welfare-nurseries" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["child-welfare-nurseries"]} />
    </ToolPageShell>
  );
}
