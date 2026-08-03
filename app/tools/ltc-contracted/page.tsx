import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/ltc-contracted`;
const catalogEntry = getToolCatalogEntry("ltc-contracted");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["長照特約機構", "長照2.0", "居家服務", "日間照顧", "喘息服務"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "長照特約服務機構查詢", description: "查詢全台長照2.0特約服務機構。", url: canonical },
};

export default function LtcContractedPage() {
  return (
    <ToolPageShell slug="ltc-contracted" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["ltc-contracted"]} />
    </ToolPageShell>
  );
}
