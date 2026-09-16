import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/pesticide-sales`;
const catalogEntry = getToolCatalogEntry("pesticide-sales");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["農藥販賣業執照", "植物保護資材", "合法農藥", "病蟲害防治", "安全採收期", "農業部開放資料"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function PesticideSalesPage() {
  return (
    <ToolPageShell slug="pesticide-sales" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["pesticide-sales"]} />
    </ToolPageShell>
  );
}
