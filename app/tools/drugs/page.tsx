import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import DrugsContent from "./DrugsContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/drugs`;
const catalogEntry = getToolCatalogEntry("drugs");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["藥品查詢", "藥品外觀", "許可證字號", "食藥署"],
  alternates: { canonical },
  robots: { index: false },
  openGraph: { title: "藥品查詢", description: "查詢藥品許可證字號、品名與外觀特徵。", url: canonical },
};

export default function DrugsPage() {
  return (
    <ToolPageShell slug="drugs" title={catalogEntry.title} maxWidthClassName="max-w-4xl">
      <DrugsContent />
    </ToolPageShell>
  );
}
