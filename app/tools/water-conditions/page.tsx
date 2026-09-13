import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import WaterConditionsContent from "./WaterConditionsContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/water-conditions`;
const catalogEntry = getToolCatalogEntry("water-conditions");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: [
    "水位站",
    "河川水位",
    "地下水位",
    "水庫",
    "蓄水量",
    "水情",
    "水利署",
    "防汛",
  ],
  alternates: { canonical },
  robots: { index: false },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function WaterConditionsPage() {
  return (
    <ToolPageShell
      slug="water-conditions"
      title={catalogEntry.title}
      maxWidthClassName="max-w-4xl"
    >
      <WaterConditionsContent />
    </ToolPageShell>
  );
}
