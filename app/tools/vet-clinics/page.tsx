import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/vet-clinics`;
const catalogEntry = getToolCatalogEntry("vet-clinics");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["動物醫院查詢", "獸醫診所", "寵物醫院", "全台獸醫師名冊"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "全台動物醫院與獸醫診所查詢", description: "查詢合法登記之獸醫診療機構與動物醫院。", url: canonical },
};

export default function VetClinicsPage() {
  return (
    <ToolPageShell slug="vet-clinics" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["vet-clinics"]} />
    </ToolPageShell>
  );
}
