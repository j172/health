import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import MetroAlertsContent from "@/components/Tools/MetroAlertsContent";
import { getMetroAlerts } from "@/lib/server/metroAlerts/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/metro-alerts`;
const catalogEntry = getToolCatalogEntry("metro-alerts");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["捷運公告", "捷運電梯檢修", "台北捷運即時資訊", "無障礙電梯動態", "北捷營運公告"],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default async function MetroAlertsPage() {
  const initialAlerts = await getMetroAlerts({ limit: 50 });

  return (
    <ToolPageShell slug="metro-alerts" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <MetroAlertsContent initialAlerts={initialAlerts} />
    </ToolPageShell>
  );
}
