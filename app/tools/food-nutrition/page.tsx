import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FoodNutritionContent from "./FoodNutritionContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/food-nutrition`;
const catalogEntry = getToolCatalogEntry("food-nutrition");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["食品營養成分", "營養成分資料庫", "食藥署", "熱量查詢"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "食品營養成分查詢", description: "查詢食品熱量與各項營養成分含量。", url: canonical },
};

export default function FoodNutritionPage() {
  return (
    <ToolPageShell slug="food-nutrition" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <FoodNutritionContent />
    </ToolPageShell>
  );
}
