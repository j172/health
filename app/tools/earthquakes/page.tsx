import type { Metadata } from "next";
import { getRecentSignificantEarthquakes } from "@/lib/server/earthquakes/queries";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import EarthquakeContent from "./EarthquakeContent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/earthquakes`;
const catalogEntry = getToolCatalogEntry("earthquakes");

// Title/description intentionally differ from TOOL_CATALOG's copy here — a
// longer, keyword-suffixed <title>/meta-description variant for search
// snippets specifically (see catalog.ts's shorter entry, used verbatim by
// llms.txt/sitemap/ToolPageShell's structured data instead).
export const metadata: Metadata = {
  title: "全球顯著地震查詢 (M6.0+) | 即時地震與海嘯動態",
  description: "即時查詢全台與全球 M6.0+ 顯著地震資訊，包含震央地點、芮氏規模、震源深度、海嘯警報提示與 USGS / EMSC / CWA 聯合測報。",
  keywords: ["地震", "顯著地震", "地震查詢", "海嘯警報", "USGS", "CWA", "氣象署"],
  alternates: { canonical },
  openGraph: {
    title: "全球顯著地震查詢 (M6.0+) | 即時地震與海嘯動態",
    description: "即時查詢全台與全球 M6.0+ 顯著地震資訊，包含震央地點、芮氏規模與海嘯警報提示。",
    url: canonical,
  },
};

export default async function EarthquakesPage() {
  const earthquakes = await getRecentSignificantEarthquakes(4.0, 720, 50);

  return (
    <ToolPageShell slug="earthquakes" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <EarthquakeContent earthquakes={earthquakes} />
    </ToolPageShell>
  );
}
