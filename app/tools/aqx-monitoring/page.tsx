import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AqxMonitoringContent from "./AqxMonitoringContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/aqx-monitoring`;
const catalogEntry = getToolCatalogEntry("aqx-monitoring");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "空氣品質",
    "AQX",
    "BTEX",
    "非甲烷碳氫化合物",
    "總碳氫化合物",
    "光化測站",
    "PM10",
    "CO 8小時平均值",
    "環境部",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function AqxMonitoringPage() {
  return (
    <ToolPageShell slug="aqx-monitoring" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <AqxMonitoringContent />
    </ToolPageShell>
  );
}
