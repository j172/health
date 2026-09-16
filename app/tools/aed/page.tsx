import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import AedContent from "@/components/Tools/AedContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/aed`;
const catalogEntry = getToolCatalogEntry("aed");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "AED",
    "自動體外心臟去顫器",
    "公共場所AED地圖",
    "心臟驟停急救",
    "衛福部AED統計",
    "CPR+AED",
    "黃金4分鐘",
    "急救設備地圖",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function AedPage() {
  return (
    <ToolPageShell slug="aed" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <AedContent />
    </ToolPageShell>
  );
}
