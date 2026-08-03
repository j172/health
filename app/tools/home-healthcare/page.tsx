import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/home-healthcare`;
const catalogEntry = getToolCatalogEntry("home-healthcare");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["居家醫療", "居家照護", "居家安寧", "健保特約機構"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "居家醫療查詢", description: "查詢提供居家醫療照護服務的特約機構。", url: canonical },
};

export default function HomeHealthcarePage() {
  return (
    <ToolPageShell slug="home-healthcare" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["home-healthcare"]} />
    </ToolPageShell>
  );
}
