import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/pharmacies`;
const catalogEntry = getToolCatalogEntry("pharmacies");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["藥局查詢", "健保特約藥局", "一般藥局"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "藥局查詢", description: "查詢全台一般藥局及健保特約藥局。", url: canonical },
};

export default function PharmaciesPage() {
  return (
    <ToolPageShell slug="pharmacies" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs.pharmacies} />
    </ToolPageShell>
  );
}
