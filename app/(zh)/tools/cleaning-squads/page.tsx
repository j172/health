import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CleaningSquadsContent from "./CleaningSquadsContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/cleaning-squads`;
const catalogEntry = getToolCatalogEntry("cleaning-squads");

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

export default function CleaningSquadsPage() {
  return (
    <ToolPageShell slug="cleaning-squads" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <CleaningSquadsContent />
    </ToolPageShell>
  );
}
