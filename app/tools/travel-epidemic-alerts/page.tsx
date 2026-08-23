import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import TravelEpidemicAlertsContent from "@/components/Epidemic/TravelEpidemicAlertsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/travel-epidemic-alerts`;
const catalogEntry = getToolCatalogEntry("travel-epidemic-alerts");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["旅遊疫情", "國際疫情", "疾管署", "出國警戒", "旅遊醫學", "登革熱", "麻疹", "狂犬病"],
  alternates: { canonical },
  openGraph: { title: "國際旅遊疫情與即時情報地圖", description: "即時查詢衛福部疾管署全球旅遊疫情建議等級與各國爆發重要疫情情報。", url: canonical },
};

export default function TravelEpidemicAlertsPage() {
  return (
    <ToolPageShell slug="travel-epidemic-alerts" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <TravelEpidemicAlertsContent />
    </ToolPageShell>
  );
}
