import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import NpoOrganizationsContent from "./NpoOrganizationsContent";
import ContextualPartnerCard from "@/components/Common/ContextualPartnerCard";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/npo-organizations`;
const catalogEntry = getToolCatalogEntry("npo-organizations");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "公益組織",
    "NPO",
    "非營利組織",
    "社會福利",
    "財團法人",
    "公益協會",
    "統一編號",
    "公益資訊中心",
    "社福機構查詢",
  ],
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function NpoOrganizationsPage() {
  return (
    <ToolPageShell slug="npo-organizations" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <ContextualPartnerCard
        partnerId="council2026"
        contextTitle="陽光政治與公眾監督"
        contextDescription="深化公民監督知情權：除查核社會公益團體與社福法人資訊外，可前往「2026 政治人物前科查詢」檢驗民意代表與候選人公開司法紀錄。"
      />
      <ContextualPartnerCard
        partnerId="amnesty-taiwan"
        contextTitle="全球人權連署與海外人道援助"
        contextDescription="參與跨國公民行動：除國內公益慈善與社福機構外，前往國際特赦組織「採取行動」參與全球緊急連署，亦可了解 Taiwan AID 臺灣海外 NGO 聯盟與國合會海外志工管道。"
      />
      <NpoOrganizationsContent />
    </ToolPageShell>
  );
}
