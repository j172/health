import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FoodSafetyContent from "@/components/Tools/FoodSafetyContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/food-safety`;
const catalogEntry = getToolCatalogEntry("food-safety");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "蔬果農藥殘留",
    "農藥抽檢合格率",
    "農業部質譜快檢",
    "食安透明看板",
    "蔬菜怎麼洗",
    "草莓農藥清洗",
    "高麗菜農藥",
    "連續採收作物",
    "農藥超標黑名單",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function FoodSafetyPage() {
  return (
    <ToolPageShell slug="food-safety" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <FoodSafetyContent />
    </ToolPageShell>
  );
}
