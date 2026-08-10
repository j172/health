import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/disability-atm`;
const catalogEntry = getToolCatalogEntry("disability-atm");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["無障礙ATM", "信用合作社", "輪椅可及", "語音服務ATM"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "信用合作社無障礙ATM查詢", description: "查詢全台信用合作社無障礙ATM。", url: canonical },
};

export default function DisabilityAtmPage() {
  return (
    <ToolPageShell slug="disability-atm" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["disability-atm"]} />
    </ToolPageShell>
  );
}
