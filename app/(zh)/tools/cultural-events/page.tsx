import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CulturalEventsContent from "@/components/Activities/CulturalEventsContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/cultural-events`;
const catalogEntry = getToolCatalogEntry("cultural-events");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["藝文展覽", "文化部", "展覽查詢", "親子活動", "音樂會", "戲劇表演", "講座", "公益活動", "志工培訓", "台灣公益資訊中心"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function CulturalEventsPage() {
  return (
    <ToolPageShell slug="cultural-events" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <ContextualPartnerCard
        partnerId="g0v"
        contextTitle="開源公民科技與黑客松"
        contextDescription="除藝文與公衛公益活動外，歡迎參與「g0v 零時政府」雙月大松、專案小聚與開源工作坊，用科技與公民協作帶來改變。"
      />
      <CulturalEventsContent />
    </ToolPageShell>
  );
}

