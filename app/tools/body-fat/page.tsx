import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import BodyFatCalculator from "./BodyFatCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/body-fat`;

export const metadata: Metadata = {
  title: "體脂率計算器",
  description: "採用美國海軍體脂計算法（Navy Method），計算體脂率、脂肪質量與肌肉量，對照 ACSM 標準分類。",
  keywords: ["體脂率計算", "Navy Method", "ACSM", "體脂肪"],
  alternates: { canonical },
  openGraph: { title: "體脂率計算器", description: "計算體脂率、脂肪質量與肌肉量。", url: canonical },
};

export default function BodyFatPage() {
  return (
    <ToolPageShell slug="body-fat" title="體脂率計算器">
      <BodyFatCalculator />
    </ToolPageShell>
  );
}
