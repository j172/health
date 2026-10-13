import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/funeral-facilities`;
const catalogEntry = getToolCatalogEntry("funeral-facilities");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["公立公墓", "靈骨塔", "納骨塔", "火化場", "殯儀館", "合法禮儀公司", "樹葬自然葬", "內政部殯葬資訊網"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function FuneralFacilitiesPage() {
  return (
    <ToolPageShell slug="funeral-facilities" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["funeral-facilities"]} />
    </ToolPageShell>
  );
}
