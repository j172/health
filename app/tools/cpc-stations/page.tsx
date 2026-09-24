import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CpcStationsClient from "@/components/Tools/CpcStationsClient";
import { searchCpcStations } from "@/lib/server/cpc/stations";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/cpc-stations`;
const catalogEntry = getToolCatalogEntry("cpc-stations");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "台灣中油",
    "中油加油站",
    "加油站地圖",
    "洗車服務",
    "電動車充電",
    "電動機車換電",
    "來速咖啡",
    "Cup Go",
    "輪胎打氣機",
    "自助加油",
    "悠遊卡加油",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default async function CpcStationsPage() {
  const data = await searchCpcStations({ limit: 650 });

  return (
    <ToolPageShell slug="cpc-stations" title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <CpcStationsClient
        initialStations={data.stations}
        allServices={data.allServices}
      />
    </ToolPageShell>
  );
}
