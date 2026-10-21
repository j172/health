import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/early-intervention`;
const catalogEntry = getToolCatalogEntry("early-intervention");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["早期療育", "發展遲緩", "聯合評估中心"],
  alternates: { canonical },
  openGraph: { title: "早期療育資源地圖", description: "查詢全國早期療育單位與縣市聯合評估中心。", url: canonical },
};

export default function EarlyInterventionPage() {
  return (
    <ToolPageShell slug="early-intervention" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["early-intervention"]} />
    </ToolPageShell>
  );
}
