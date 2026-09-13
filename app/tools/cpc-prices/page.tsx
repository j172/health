import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CpcPricesClient from "@/components/Tools/CpcPricesClient";
import { getCpcPrices, getCpcPriceSummary } from "@/lib/server/cpc/prices";

export const dynamic = "force-dynamic";
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
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default async function CpcPricesPage() {
  const [pricesData, summary] = await Promise.all([
    getCpcPrices(),
    getCpcPriceSummary(),
  ]);

  return (
    <ToolPageShell slug="cpc-prices" title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <CpcPricesClient
        initialItems={pricesData.items}
        initialCategories={pricesData.categories}
        initialSummary={summary}
        updatedAt={pricesData.updatedAt}
      />
    </ToolPageShell>
  );
}
