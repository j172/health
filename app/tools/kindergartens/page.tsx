import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/kindergartens`;
const catalogEntry = getToolCatalogEntry("kindergartens");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["幼兒園", "幼兒園查詢", "公立幼兒園", "私立幼兒園", "非營利幼兒園", "教育部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "全國幼兒園查詢", description: "查詢全國公立、私立與非營利幼兒園名錄。", url: canonical },
};

export default function KindergartensPage() {
  return (
    <ToolPageShell slug="kindergartens" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <ContextualPartnerCard
        partnerId="metawilo"
        contextTitle="守護幼兒安全防護線"
        contextDescription="為孩子挑選優質園所：除教育部立案資訊與裁罰紀錄外，建議搭配「台灣罪犯圖鑑」查核重大刑案與司法判決公開紀錄。"
      />
      <FacilitySearchContent config={facilitySearchConfigs["kindergartens"]} />
    </ToolPageShell>
  );
}
