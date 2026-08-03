import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AqiContent from "./AqiContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/aqi`;
const catalogEntry = getToolCatalogEntry("aqi");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["AQI", "空氣品質", "PM2.5", "環境部"],
  alternates: { canonical },
  openGraph: { title: "AQI 空氣品質即時查詢", description: "即時顯示全台空氣品質指標。", url: canonical },
};

export default function AqiPage() {
  return (
    <ToolPageShell slug="aqi" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <AqiContent />
    </ToolPageShell>
  );
}
