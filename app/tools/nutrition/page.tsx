import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import NutritionAdvisor from "./NutritionAdvisor";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/nutrition`;
const catalogEntry = getToolCatalogEntry("nutrition");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["營養素計算", "蛋白質攝取", "三大營養素", "飲食計畫"],
  alternates: { canonical },
  openGraph: { title: "每日營養素建議計算器", description: "提供每日三大營養素攝取建議。", url: canonical },
};

export default function NutritionPage() {
  return (
    <ToolPageShell slug="nutrition" title={catalogEntry.title}>
      <NutritionAdvisor />
    </ToolPageShell>
  );
}
