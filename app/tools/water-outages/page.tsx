import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WaterOutagesContent from "@/components/WaterOutages/WaterOutagesContent";

export const revalidate = 180;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/water-outages`;
const catalogEntry = getToolCatalogEntry("water-outages");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "自來水停水查詢",
    "即時停水地圖",
    "緊急供水站",
    "取水車據點",
    "台灣自來水公司",
    "台北自來水事業處",
    "停水施工公告",
    "水管破裂搶修",
    "民生用水儲水",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function WaterOutagesPage() {
  return (
    <ToolPageShell
      slug="water-outages"
      title={catalogEntry.title}
      maxWidthClassName="max-w-6xl"
    >
      <WaterOutagesContent />
    </ToolPageShell>
  );
}
