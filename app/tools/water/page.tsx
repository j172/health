import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import { WaterCalculator } from "./WaterCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/water`;

export const metadata: Metadata = {
  title: "飲水量計算器",
  description: "依體重與活動量計算每日建議飲水量，並提供分段補水時間表，幫助您養成良好的補水習慣。",
  keywords: ["飲水量計算", "每日飲水量", "補水時間表", "水分攝取"],
  alternates: { canonical },
  openGraph: { title: "飲水量計算器", description: "依體重與活動量計算每日建議飲水量。", url: canonical },
};

export default function WaterPage() {
  return (
    <ToolPageShell slug="water" title="飲水量計算器">
      <WaterCalculator />
    </ToolPageShell>
  );
}
