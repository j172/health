import type { Metadata } from "next";
import { getBaseUrl } from "@/lib/server/news/seo";
import { getToolCatalogEntry } from "@/lib/server/tools/catalog";
import ToolPageShell from "@/components/Tools/ToolPageShell";
import DengueMosquitoMapContent from "@/components/DengueMosquitoMap/DengueMosquitoMapContent";

export const revalidate = 300;
export const runtime = "nodejs";

const canonical = `${getBaseUrl()}/tools/dengue-mosquito-map`;
const catalogEntry = getToolCatalogEntry("dengue-mosquito-map");

export const metadata: Metadata = {
  title: catalogEntry.title,
  description: catalogEntry.description,
  keywords: ["登革熱", "病媒蚊", "布氏指數", "BI", "House Index", "容器指數", "幼蟲指數", "疾病管制署", "病媒蚊密度地圖"],
  alternates: { canonical },
  openGraph: {
    title: catalogEntry.title,
    description: catalogEntry.description,
    url: canonical,
  },
};

export default function DengueMosquitoMapPage() {
  return (
    <ToolPageShell slug="dengue-mosquito-map" title={catalogEntry.title} maxWidthClassName="max-w-5xl">
      <DengueMosquitoMapContent />
    </ToolPageShell>
  );
}
