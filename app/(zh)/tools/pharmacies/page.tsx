import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { parseGeolocationOverrideFromPlainParams } from "@/lib/utils/geolocationOverride";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/pharmacies`;
const catalogEntry = getToolCatalogEntry("pharmacies");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["藥局查詢", "健保特約藥局", "一般藥局"],
  alternates: { canonical },
  openGraph: { title: "藥局查詢", description: "查詢全台一般藥局及健保特約藥局。", url: canonical },
};

export default async function PharmaciesPage({
  searchParams,
}: {
  searchParams: Promise<{ lat?: string; lng?: string }>;
}) {
  // issue #463：地圖彈出視窗「看附近的藥局」深連結帶入的 ?lat=&lng=，有提供時
  // 讓藥局查詢以該點位為中心顯示結果，不需要使用者重新定位。
  const locationOverride = parseGeolocationOverrideFromPlainParams(await searchParams);

  return (
    <ToolPageShell slug="pharmacies" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs.pharmacies} locationOverride={locationOverride} slug="pharmacies" />
    </ToolPageShell>
  );
}
