import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CulturalActivitiesContent from "@/components/Activities/CulturalActivitiesContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/family-cultural-activities`;
const catalogEntry = getToolCatalogEntry("family-cultural-activities");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["親子活動", "兒童劇團", "文化部", "藝文活動", "親子音樂會", "OPENTIX", "週末親子展演"],
  alternates: { canonical },
  openGraph: { title: "全國親子藝文活動查詢", description: "即時查詢文化部全國親子及兒童藝文展演活動檔期與場館地圖。", url: canonical },
};

export default function FamilyCulturalActivitiesPage() {
  return (
    <ToolPageShell slug="family-cultural-activities" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <CulturalActivitiesContent />
    </ToolPageShell>
  );
}
