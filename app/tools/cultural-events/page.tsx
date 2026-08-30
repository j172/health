import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CulturalEventsContent from "@/components/Activities/CulturalEventsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/cultural-events`;
const catalogEntry = getToolCatalogEntry("cultural-events");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["藝文展覽", "文化部", "展覽查詢", "親子活動", "音樂會", "戲劇表演", "講座"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function CulturalEventsPage() {
  return (
    <ToolPageShell slug="cultural-events" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <CulturalEventsContent />
    </ToolPageShell>
  );
}

