import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/cram-schools`;
const catalogEntry = getToolCatalogEntry("cram-schools");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["補習班", "短期補習班", "升學文理", "外語補習班", "技藝補習班", "立案查詢", "教育部"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "全國短期補習班查詢", description: "查詢全國 22 縣市立案短期補習班名冊與地址。", url: canonical },
};

export default function CramSchoolsPage() {
  return (
    <ToolPageShell slug="cram-schools" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <div className="mb-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ContextualPartnerCard
          partnerId="metawilo"
          compact={true}
          contextTitle="補教環境司法判決查核"
          contextDescription="為學子把關課後學習安全：建議前往「台灣罪犯圖鑑」查核涉及兒少性犯罪公開判決。"
        />
        <ContextualPartnerCard
          partnerId="sports-coach"
          compact={true}
          contextTitle="運動與才藝教練資格查核"
          contextDescription="把關體育與運動培訓安全：建議前往「運動部專區」查核涉及違法情事之不適任教練名單。"
        />
      </div>
      <FacilitySearchContent config={facilitySearchConfigs["cram-schools"]} />
    </ToolPageShell>
  );
}
