import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import BloodPressureAnalyzer from "./BloodPressureAnalyzer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/blood-pressure`;
const catalogEntry = getToolCatalogEntry("blood-pressure");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["血壓分析", "高血壓", "ESH指南", "血壓分類"],
  alternates: { canonical },
  openGraph: { title: "血壓分析器", description: "依 2023 ESH 高血壓指南分類血壓等級。", url: canonical },
};

export default function BloodPressurePage() {
  return (
    <ToolPageShell slug="blood-pressure" title={catalogEntry.title}>
      <BloodPressureAnalyzer />
    </ToolPageShell>
  );
}
