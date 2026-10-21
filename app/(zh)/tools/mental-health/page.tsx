import type { Metadata } from "next";
import { Suspense } from "react";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LoadingOrb from "@/components/ui/LoadingOrb";
import MentalHealthContent from "./MentalHealthContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/mental-health`;
const catalogEntry = getToolCatalogEntry("mental-health");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "心理諮商",
    "臨床心理",
    "社區心理衛生中心",
    "心衛中心",
    "1925安心專線",
    "心理治療",
    // issue #566: 成癮防治分頁
    "藥癮戒治",
    "戒毒",
    "替代治療",
    "0800-770-885",
  ],
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function MentalHealthPage() {
  return (
    <ToolPageShell slug="mental-health" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <Suspense
        fallback={
          <div className="flex justify-center py-8">
            <LoadingOrb size={32} />
          </div>
        }
      >
        <MentalHealthContent />
      </Suspense>
    </ToolPageShell>
  );
}
