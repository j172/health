import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/accessible-parking`;
const catalogEntry = getToolCatalogEntry("accessible-parking");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["身心障礙車位", "孕婦親子車位", "復康巴士停車", "無障礙停車"],
  alternates: { canonical },
  openGraph: {
    title: "孕婦親子／身心障礙／復康巴士車位查詢",
    description: "查詢全台停車場與路邊停車的特殊車位，顯示即時剩餘車位數。",
    url: canonical,
  },
};

export default function AccessibleParkingPage() {
  return (
    <ToolPageShell slug="accessible-parking" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <FacilitySearchContent config={facilitySearchConfigs["accessible-parking"]} />
    </ToolPageShell>
  );
}
