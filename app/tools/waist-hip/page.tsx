import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WaistHipCalculator from "./WaistHipCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/waist-hip`;

export const metadata: Metadata = {
  title: "腰臀比計算器",
  description: "計算腰臀比（WHR），依 WHO 標準評估腹部肥胖與心血管代謝風險。",
  keywords: ["腰臀比計算", "WHR", "腹部肥胖", "WHO標準"],
  alternates: { canonical },
  openGraph: { title: "腰臀比計算器", description: "依 WHO 標準評估腹部肥胖與心血管代謝風險。", url: canonical },
};

export default function WaistHipPage() {
  return (
    <ToolPageShell slug="waist-hip" title="腰臀比計算器">
      <WaistHipCalculator />
    </ToolPageShell>
  );
}
