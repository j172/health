import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import BMICalculator from "./BMICalculator";

// StabloHeader renders a live DB-backed weather-alert bar (same as /news),
// so this page can't be statically prerendered at build time either.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/bmi`;

export const metadata: Metadata = {
  title: "BMI 計算器",
  description:
    "免費線上 BMI 身體質量指數計算器，輸入身高與體重即可立即計算您的 BMI 值，並對照台灣衛生福利部國民健康署標準，了解過輕、正常、過重或肥胖的健康風險。",
  keywords: ["BMI計算器", "身體質量指數", "體重標準", "健康體重", "台灣BMI標準"],
  alternates: { canonical },
  openGraph: { title: "BMI 計算器", description: "免費線上 BMI 計算器，對照台灣國健署健康體重標準。", url: canonical },
};

export default function BmiPage() {
  return (
    <ToolPageShell slug="bmi" title="BMI 計算器">
      <BMICalculator />
    </ToolPageShell>
  );
}
