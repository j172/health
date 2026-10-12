import type { Metadata } from "next";
import { Suspense } from "react";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LoadingOrb from "@/components/ui/LoadingOrb";
import CpcPricesStationsContent from "./CpcPricesStationsContent";
import { getCpcPrices, getCpcPriceSummary } from "@/lib/server/cpc/prices";
import { searchCpcStations } from "@/lib/server/cpc/stations";

// issue #483 (2.0 §D merge item M3): the shorter of the two original
// `revalidate` values (prices was 60, stations was 300) — prices need to stay
// fresher, and tab-switching between "本週油價"/"附近加油站" is instant
// client-side state (both datasets are already in props), not a fresh fetch.
export const revalidate = 60;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/cpc-prices`;
const catalogEntry = getToolCatalogEntry("cpc-prices");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "台灣中油",
    "中油牌價",
    "油價查詢",
    "95無鉛汽油",
    "92無鉛汽油",
    "98無鉛汽油",
    "超級柴油",
    "天然氣價格",
    "桶裝瓦斯牌價",
    "中油酒類牌價",
    "液化天然氣氣源成本",
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

export default async function CpcPricesPage() {
  const [pricesData, summary, stationsData] = await Promise.all([
    getCpcPrices(),
    getCpcPriceSummary(),
    searchCpcStations({ limit: 650 }),
  ]);

  return (
    <ToolPageShell slug="cpc-prices" title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <LoadingOrb size={32} />
          </div>
        }
      >
        <CpcPricesStationsContent
          pricesItems={pricesData.items}
          pricesCategories={pricesData.categories}
          pricesSummary={summary}
          pricesUpdatedAt={pricesData.updatedAt}
          stations={stationsData.stations}
          allStationServices={stationsData.allServices}
        />
      </Suspense>
    </ToolPageShell>
  );
}
