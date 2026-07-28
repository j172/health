import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import LBMCalculator from "./LBMCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/lbm`;

export const metadata: Metadata = {
  title: "去脂體重 (LBM) 計算器",
  description: "以 Boer 公式估算去脂體重與體脂率，全面了解您的身體組成狀況。",
  keywords: ["去脂體重", "LBM", "Boer公式", "體組成"],
  alternates: { canonical },
  openGraph: { title: "去脂體重 (LBM) 計算器", description: "以 Boer 公式估算去脂體重與體脂率。", url: canonical },
};

export default function LbmPage() {
  return (
    <ToolPageShell slug="lbm" title="去脂體重 (LBM) 計算器">
      <LBMCalculator />
    </ToolPageShell>
  );
}
