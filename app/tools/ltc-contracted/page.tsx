import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FacilitySearchContent from "@/components/Facilities/FacilitySearchContent";
import { facilitySearchConfigs } from "../facilityConfigs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/long-term-care`;
const catalogEntry = getToolCatalogEntry("long-term-care");

export const metadata: Metadata = {
  title: `${catalogEntry.title}（原長照特約機構查詢）`,
  description: catalogEntry.description,
  keywords: ["長照特約機構", "長照2.0", "居家服務", "日間照顧", "喘息服務"],
  alternates: { canonical },
  robots: { index: false, follow: true },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function LtcContractedPage() {
  return (
    <ToolPageShell slug="long-term-care" title={catalogEntry.title} maxWidthClassName="max-w-3xl">
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs text-blue-800 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
        💡 「長照特約服務機構」已全面整併至「長照服務機構查詢」，涵蓋居家照顧、日間照顧、住宿型機構與社區據點全方位資源。
      </div>
      <FacilitySearchContent config={facilitySearchConfigs["long-term-care"]} />
    </ToolPageShell>
  );
}
