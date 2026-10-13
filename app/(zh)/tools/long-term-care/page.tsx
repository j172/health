import type { Metadata } from "next";
import { Suspense } from "react";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LongTermCareContent from "./LongTermCareContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/long-term-care`;
const catalogEntry = getToolCatalogEntry("long-term-care");

// issue #484 (2.0 §D merge item M4): merged "home-healthcare", "elder-welfare" and
// "hakka-bogong" into this page as a type filter; title/description now come from
// the rewritten catalog entry ("長照照顧圈地圖") covering all 4 facility types plus
// the new 1/3/5km care-circle feature.
export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["長照機構", "長期照顧", "長照2.0", "居家醫療", "老人福利機構", "伯公照護站", "照顧圈"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

export default function LongTermCarePage() {
  return (
    <ToolPageShell slug="long-term-care" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      {/* LongTermCareContent reads ?type= via useSearchParams, which requires a Suspense boundary in the App Router */}
      <Suspense>
        <LongTermCareContent />
      </Suspense>
    </ToolPageShell>
  );
}
