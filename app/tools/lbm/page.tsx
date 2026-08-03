import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LBMCalculator from "./LBMCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/lbm`;
const catalogEntry = getToolCatalogEntry("lbm");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["去脂體重", "LBM", "Boer公式", "體組成"],
  alternates: { canonical },
  openGraph: { title: "去脂體重 (LBM) 計算器", description: "以 Boer 公式估算去脂體重與體脂率。", url: canonical },
};

export default function LbmPage() {
  return (
    <ToolPageShell slug="lbm" title={catalogEntry.title}>
      <LBMCalculator />
    </ToolPageShell>
  );
}
