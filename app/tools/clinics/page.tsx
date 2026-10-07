import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";
import { facilitySearchConfigs } from "../facilityConfigs";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/clinics`;
const catalogEntry = getToolCatalogEntry("clinics");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["醫療院所查詢", "健保特約醫院", "台灣醫院搜尋"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "醫療院所查詢", description: "查詢全民健保特約醫療院所。", url: canonical },
};

export default function ClinicsPage() {
  return (
    <ToolPageShell slug="clinics" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <div className="mb-4">
        <ContextualPartnerCard
          partnerId="mohw-vio"
          compact={true}
          contextTitle="就醫安全防護與醫事人員性平查核"
          contextDescription="為保障自身就醫安全與權益：就診前可前往衛福部專區查核經確定判決之違法醫事人員名單。"
          actionText="前往查核"
        />
      </div>
      <FacilitySearchContent config={facilitySearchConfigs.clinics} />
    </ToolPageShell>
  );
}
