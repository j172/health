import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import BMICalculator from "./BMICalculator";

// StabloHeader renders a live DB-backed weather-alert bar (same as /news),
// so this page can't be statically prerendered at build time either.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/bmi`;
const catalogEntry = getToolCatalogEntry("bmi");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["BMI計算器", "身體質量指數", "體重標準", "健康體重", "台灣BMI標準"],
  alternates: { canonical },
  openGraph: { title: "BMI 計算器", description: "免費線上 BMI 計算器，對照台灣國健署健康體重標準。", url: canonical },
};

export default function BmiPage() {
  return (
    <ToolPageShell slug="bmi" title={catalogEntry.title}>
      <BMICalculator />
    </ToolPageShell>
  );
}
