import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import StressAssessment from "./StressAssessment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/stress`;
const catalogEntry = getToolCatalogEntry("stress");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["壓力測驗", "PSS-10", "知覺壓力量表", "減壓"],
  alternates: { canonical },
  openGraph: { title: "壓力評估測驗", description: "量化壓力程度，提供個人化減壓策略。", url: canonical },
};

export default function StressPage() {
  return (
    <ToolPageShell slug="stress" title={catalogEntry.title}>
      <StressAssessment />
    </ToolPageShell>
  );
}
