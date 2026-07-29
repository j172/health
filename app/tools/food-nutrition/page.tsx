import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FoodNutritionContent from "./FoodNutritionContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/food-nutrition`;

export const metadata: Metadata = {
  title: "食品營養成分查詢",
  description: "查詢衛福部食藥署食品營養成分資料庫，依食品名稱搜尋熱量、蛋白質、脂肪、碳水化合物等營養成分含量。",
  keywords: ["食品營養成分", "營養成分資料庫", "食藥署", "熱量查詢"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "食品營養成分查詢", description: "查詢食品熱量與各項營養成分含量。", url: canonical },
};

export default function FoodNutritionPage() {
  return (
    <ToolPageShell slug="food-nutrition" title="食品營養成分查詢" maxWidthClassName="max-w-4xl">
      <FoodNutritionContent />
    </ToolPageShell>
  );
}
