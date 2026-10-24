import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import PowerOutagesContent from "@/components/Tools/PowerOutagesContent";

export const revalidate = 60;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/power-outages`;
const catalogEntry = getToolCatalogEntry("power-outages");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: catalogEntry.keywords,
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function PowerOutagesPage() {
  return (
    <ToolPageShell
      slug="power-outages"
      title={catalogEntry.title}
      maxWidthClassName="max-w-6xl"
    >
      <PowerOutagesContent />
    </ToolPageShell>
  );
}
