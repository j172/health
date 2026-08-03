import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/clinics`;
const catalogEntry = getToolCatalogEntry("clinics");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["醫療院所查詢", "健保特約醫院", "台灣醫院搜尋"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "醫療院所查詢", description: "查詢全民健保特約醫療院所。", url: canonical },
};

export default function ClinicsPage() {
  return (
    <ToolPageShell slug="clinics" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs.clinics} />
    </ToolPageShell>
  );
}
