import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/green-restaurants`;
const catalogEntry = getToolCatalogEntry("green-restaurants");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["環保餐廳", "綠色餐廳", "環境即時通", "環保標章", "環境部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function GreenRestaurantsPage() {
  return (
    <ToolPageShell slug="green-restaurants" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["green-restaurants"]} />
    </ToolPageShell>
  );
}
