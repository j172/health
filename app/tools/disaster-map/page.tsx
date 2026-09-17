import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import DisasterMapContent from "@/components/DisasterMap/DisasterMapContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/disaster-map`;
const catalogEntry = getToolCatalogEntry("disaster-map");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["防災地圖", "避難收容處所", "消防救援單位", "應變中心", "內政部", "防災", "避難地圖"],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function DisasterMapPage() {
  return (
    <ToolPageShell slug="disaster-map" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <ContextualPartnerCard
        partnerId="kuma"
        contextTitle="全民防衛避難與民防準備"
        contextDescription="防災避難不只找尋收容處所：平時前往「黑熊學院」掌握自主避難包準備、戰時民防應變與基礎急救技能，強化家庭防衛韌性。"
      />
      <DisasterMapContent />
    </ToolPageShell>
  );
}
