import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import PestAlertsContent from "@/components/Tools/PestAlertsContent";
import { getPestAlerts } from "@/lib/server/pestAlerts/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/pest-alerts`;
const catalogEntry = getToolCatalogEntry("pest-alerts");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["病蟲害示警", "農業病蟲害", "作物病蟲害即時預警", "防檢署監測", "害蟲通報"],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default async function PestAlertsPage() {
  const initialAlerts = await getPestAlerts({ limit: 30 });

  return (
    <ToolPageShell slug="pest-alerts" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <PestAlertsContent initialAlerts={initialAlerts} />
    </ToolPageShell>
  );
}
