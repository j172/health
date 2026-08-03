import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import { WaterCalculator } from "./WaterCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/water`;
const catalogEntry = getToolCatalogEntry("water");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["飲水量計算", "每日飲水量", "補水時間表", "水分攝取"],
  alternates: { canonical },
  openGraph: { title: "飲水量計算器", description: "依體重與活動量計算每日建議飲水量。", url: canonical },
};

export default function WaterPage() {
  return (
    <ToolPageShell slug="water" title={catalogEntry.title}>
      <WaterCalculator />
    </ToolPageShell>
  );
}
