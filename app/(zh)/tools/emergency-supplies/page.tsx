import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EmergencySuppliesContent from "@/components/Tools/EmergencySuppliesContent";

export const revalidate = 3600;
export const runtime = "nodejs";

const slug = "emergency-supplies";
const canonical = `${getBaseUrl()}/tools/${slug}`;
const catalogEntry = getToolCatalogEntry(slug);

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "緊急避難包",
    "避難包清單",
    "居家儲備物資",
    "國防部全民安全指引",
    "防災物資計算機",
    "當危機來臨時",
    "Go-Bag",
    "72小時物資",
    "黃金72小時",
    "避難包重量",
    "飲用水儲備",
    "防災包檢核表",
    "消防防災e點通",
    "防空避難",
    "全民國防手冊",
  ],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function EmergencySuppliesPage() {
  return (
    <ToolPageShell slug={slug} title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <EmergencySuppliesContent />
    </ToolPageShell>
  );
}
