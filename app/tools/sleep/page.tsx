import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import SleepAssessment from "./SleepAssessment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/sleep`;
const catalogEntry = getToolCatalogEntry("sleep");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["睡眠評估", "PSQI", "睡眠品質", "失眠", "Apple Watch睡眠", "iPhone睡眠追蹤"],
  alternates: { canonical },
  openGraph: { title: "睡眠品質評估", description: "評估您的睡眠狀況並提供改善建議，支援 Apple Watch 睡眠追蹤紀錄。", url: canonical },
};

export default function SleepPage() {
  return (
    <ToolPageShell slug="sleep" title={catalogEntry.title}>
      <SleepAssessment />
    </ToolPageShell>
  );
}
