import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import HeartRateCalculator from "./HeartRateCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/heart-rate`;

export const metadata: Metadata = {
  title: "目標心率計算器",
  description: "使用 Karvonen 公式計算 5 個運動強度心率區間，幫助您精準控制訓練強度。",
  keywords: ["心率計算", "Karvonen公式", "目標心率", "運動強度"],
  alternates: { canonical },
  openGraph: { title: "目標心率計算器", description: "計算 5 個運動強度心率區間。", url: canonical },
};

export default function HeartRatePage() {
  return (
    <ToolPageShell slug="heart-rate" title="目標心率計算器">
      <HeartRateCalculator />
    </ToolPageShell>
  );
}
