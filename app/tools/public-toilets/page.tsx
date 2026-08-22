import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

// StabloHeader renders a live DB-backed weather-alert bar (same as /news),
// so this page can't be statically prerendered at build time either.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/public-toilets`;
const catalogEntry = getToolCatalogEntry("public-toilets");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["公廁查詢", "無障礙廁所", "親子廁所", "性別友善廁所", "尿布台"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function PublicToiletsPage() {
  return (
    <ToolPageShell
      slug="public-toilets"
      title={catalogEntry.title}
      maxWidthClassName="max-w-3xl"
    >
      <FacilitySearchContent config={facilitySearchConfigs["public-toilets"]} />
    </ToolPageShell>
  );
}
