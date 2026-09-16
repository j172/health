import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/green-shops`;
const catalogEntry = getToolCatalogEntry("green-shops");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["綠色商店", "環保標章商品", "碳足跡標籤", "環保餐廳", "綠色生活", "環境部開放資料", "自備購物袋優惠"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function GreenShopsPage() {
  return (
    <ToolPageShell slug="green-shops" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["green-shops"]} />
    </ToolPageShell>
  );
}
