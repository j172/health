import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import ReservoirStatusContent from "./ReservoirStatusContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/reservoir-status`;
const catalogEntry = getToolCatalogEntry("reservoir-status");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["水庫", "蓄水量", "水情", "水利署", "即時水位", "水庫營運"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function ReservoirStatusPage() {
  return (
    <ToolPageShell slug="reservoir-status" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <ReservoirStatusContent />
    </ToolPageShell>
  );
}
