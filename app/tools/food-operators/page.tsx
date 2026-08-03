import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FoodOperatorsContent from "./FoodOperatorsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/food-operators`;
const catalogEntry = getToolCatalogEntry("food-operators");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["食品業者登錄", "食品業者查詢", "食藥署", "統一編號查詢"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "食品業者登錄查詢", description: "查詢食品業者登錄字號與登錄項目。", url: canonical },
};

export default function FoodOperatorsPage() {
  return (
    <ToolPageShell slug="food-operators" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <FoodOperatorsContent />
    </ToolPageShell>
  );
}
