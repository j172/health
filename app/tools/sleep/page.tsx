import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import SleepAssessment from "./SleepAssessment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/sleep`;

export const metadata: Metadata = {
  title: "睡眠品質評估",
  description: "基於 PSQI 量表 7 個面向，評估您的睡眠狀況並提供科學化睡眠衛生改善建議。",
  keywords: ["睡眠評估", "PSQI", "睡眠品質", "失眠"],
  alternates: { canonical },
  openGraph: { title: "睡眠品質評估", description: "評估您的睡眠狀況並提供改善建議。", url: canonical },
};

export default function SleepPage() {
  return (
    <ToolPageShell slug="sleep" title="睡眠品質評估">
      <SleepAssessment />
    </ToolPageShell>
  );
}
