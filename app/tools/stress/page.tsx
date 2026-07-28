import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import StressAssessment from "./StressAssessment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/stress`;

export const metadata: Metadata = {
  title: "壓力評估測驗",
  description: "採用 PSS-10 知覺壓力量表，10 道題目量化壓力程度，提供個人化減壓策略。",
  keywords: ["壓力測驗", "PSS-10", "知覺壓力量表", "減壓"],
  alternates: { canonical },
  openGraph: { title: "壓力評估測驗", description: "量化壓力程度，提供個人化減壓策略。", url: canonical },
};

export default function StressPage() {
  return (
    <ToolPageShell slug="stress" title="壓力評估測驗">
      <StressAssessment />
    </ToolPageShell>
  );
}
