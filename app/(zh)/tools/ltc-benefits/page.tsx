import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { readSeedJson } from "@/lib/server/db/transientSeed";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LtcBenefitsContent from "@/components/Tools/LtcBenefitsContent";
import type { LtcBenefitsSchedule, Ltc3PlanItem } from "@/lib/server/ltcBenefits/types";

export const revalidate = 3600;
export const runtime = "nodejs";

const slug = "ltc-benefits";
const baseUrl = getBaseUrl();
const canonical = `${baseUrl}/tools/${slug}`;
const catalogEntry = getToolCatalogEntry(slug);

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: catalogEntry.keywords,
  alternates: { canonical },
  openGraph: { title: catalogEntry.title, description: catalogEntry.description, url: canonical },
};

/**
 * Reads the two hand-maintained data files directly from disk — this tool
 * does NOT go through the facility-sync pipeline, same pattern as
 * `data/child-subsidies.json` → `ChildSubsidiesContent` (issue #604; see
 * `app/(zh)/tools/child-subsidies/page.tsx`).
 */
function getLtcBenefitsSchedule(): LtcBenefitsSchedule | null {
  return readSeedJson<LtcBenefitsSchedule>("ltc-benefits.json");
}

function getLtc3PlanItems(): Ltc3PlanItem[] {
  return readSeedJson<Ltc3PlanItem[]>("ltc-3-0-updates.json") ?? [];
}

export default async function LtcBenefitsPage() {
  const schedule = getLtcBenefitsSchedule();
  const updates = getLtc3PlanItems();

  if (!schedule) {
    return (
      <ToolPageShell slug={slug} title={catalogEntry.title} maxWidthClassName="max-w-6xl">
        <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          資料暫時無法載入，請稍後再試。
        </div>
      </ToolPageShell>
    );
  }

  return (
    <ToolPageShell slug={slug} title={catalogEntry.title} maxWidthClassName="max-w-6xl">
      <LtcBenefitsContent schedule={schedule} updates={updates} />
    </ToolPageShell>
  );
}
