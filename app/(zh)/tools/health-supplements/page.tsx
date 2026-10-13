import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import HealthSupplementsContent from "@/components/Tools/HealthSupplementsContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/health-supplements`;
const catalogEntry = getToolCatalogEntry("health-supplements");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["健康食品", "健字號", "小綠人標章", "保健功效", "食藥署開放資料", "審查許可"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function HealthSupplementsPage() {
  return (
    <ToolPageShell slug="health-supplements" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <HealthSupplementsContent />
    </ToolPageShell>
  );
}
