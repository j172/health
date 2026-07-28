import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import NutritionAdvisor from "./NutritionAdvisor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/nutrition`;

export const metadata: Metadata = {
  title: "每日營養素建議計算器",
  description: "依據個人體型、活動量與飲食目標，提供每日三大營養素（蛋白質、碳水化合物、脂肪）攝取建議。",
  keywords: ["營養素計算", "蛋白質攝取", "三大營養素", "飲食計畫"],
  alternates: { canonical },
  openGraph: { title: "每日營養素建議計算器", description: "提供每日三大營養素攝取建議。", url: canonical },
};

export default function NutritionPage() {
  return (
    <ToolPageShell slug="nutrition" title="每日營養素建議計算器">
      <NutritionAdvisor />
    </ToolPageShell>
  );
}
