import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import FoodOperatorsContent from "./FoodOperatorsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/food-operators`;

export const metadata: Metadata = {
  title: "食品業者登錄查詢",
  description: "查詢衛福部食藥署食品業者登錄資料，依公司名稱、統一編號或地址搜尋登錄項目。",
  keywords: ["食品業者登錄", "食品業者查詢", "食藥署", "統一編號查詢"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "食品業者登錄查詢", description: "查詢食品業者登錄字號與登錄項目。", url: canonical },
};

export default function FoodOperatorsPage() {
  return (
    <ToolPageShell slug="food-operators" title="食品業者登錄查詢" maxWidthClassName="max-w-4xl">
      <FoodOperatorsContent />
    </ToolPageShell>
  );
}
