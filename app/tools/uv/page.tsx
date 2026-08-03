import type { Metadata } from "next";
import { listAllLatestUvReadings } from "@/lib/server/cwa/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import UvContent from "./UvContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/uv`;
const catalogEntry = getToolCatalogEntry("uv");

// Title/description intentionally differ from TOOL_CATALOG's copy here — a
// longer, keyword-suffixed <title>/meta-description variant for search
// snippets specifically (see catalog.ts's shorter entry, used verbatim by
// llms.txt/sitemap/ToolPageShell's structured data instead).
export const metadata: Metadata = {
  title: "全台即時紫外線指數 (UV) | 氣象署氣象站即時數據",
  description: "即時查詢全台各縣市氣象站紫外線指數 (UV Index)，提供低量、中量、高量、過量、極高量等級劃分與專業防曬建議。",
  keywords: ["紫外線", "UV", "紫外線指數", "防曬建議", "中央氣象署", "環境部"],
  alternates: { canonical },
  openGraph: {
    title: "全台即時紫外線指數 (UV) | 氣象署氣象站即時數據",
    description: "即時查詢全台各縣市氣象站紫外線指數 (UV Index) 與防曬建議。",
    url: canonical,
  },
};

export default async function UvPage() {
  const stations = await listAllLatestUvReadings();

  return (
    <ToolPageShell slug="uv" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <UvContent stations={stations} />
    </ToolPageShell>
  );
}
