import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import CaloriesCalculator from "./CaloriesCalculator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/calories`;
const catalogEntry = getToolCatalogEntry("calories");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["卡路里計算", "TDEE", "BMR", "熱量需求", "減重", "增重"],
  alternates: { canonical },
  openGraph: { title: "卡路里需求計算器", description: "計算每日所需熱量攝取，掌握減重、增重的熱量目標。", url: canonical },
};

export default function CaloriesPage() {
  return (
    <ToolPageShell slug="calories" title={catalogEntry.title}>
      <CaloriesCalculator />
    </ToolPageShell>
  );
}
