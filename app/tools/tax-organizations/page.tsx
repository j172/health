import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/tax-organizations`;
const catalogEntry = getToolCatalogEntry("tax-organizations");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["統一編號", "扣繳單位", "機關團體", "非營利事業", "財政部", "稅籍查詢", "管委會統編"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "機關團體與扣繳單位查詢", description: "查詢全國機關團體、協會、財團法人與扣繳單位統一編號。", url: canonical },
};

export default function TaxOrganizationsPage() {
  return (
    <ToolPageShell slug="tax-organizations" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["tax-organizations"]} />
    </ToolPageShell>
  );
}
